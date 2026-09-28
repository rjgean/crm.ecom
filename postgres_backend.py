"""Small SQLite-compatible adapter for the CRM's private Supabase Postgres schema.

The browser never connects to Postgres directly. Keep the database connection
string exclusively on the server and use Supabase's session pooler on Vercel.
"""

import re


class HybridRow(dict):
    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


class Cursor:
    def __init__(self, cursor, lastrowid=None):
        self.cursor = cursor
        self.lastrowid = lastrowid
        self.rowcount = cursor.rowcount

    def fetchone(self):
        row = self.cursor.fetchone()
        return HybridRow(row) if row is not None else None

    def fetchall(self):
        return [HybridRow(row) for row in self.cursor.fetchall()]

    def __iter__(self):
        for row in self.cursor:
            yield HybridRow(row)


class Connection:
    def __init__(self, url):
        import psycopg
        from psycopg.rows import dict_row

        self.raw = psycopg.connect(url, row_factory=dict_row, connect_timeout=8, prepare_threshold=None)
        self.raw.execute("SET search_path TO crm")

    def __enter__(self):
        return self

    def __exit__(self, kind, error, traceback):
        try:
            if kind is None:
                self.raw.commit()
            else:
                self.raw.rollback()
        finally:
            self.raw.close()

    def execute(self, sql, params=()):
        statement = re.sub(r"^\s*INSERT OR IGNORE INTO\b", "INSERT INTO", sql, count=1, flags=re.I)
        ignored = bool(re.match(r"^\s*INSERT OR IGNORE INTO\b", sql, re.I))
        if ignored:
            statement += " ON CONFLICT DO NOTHING"
        returning = bool(re.match(r"^\s*INSERT INTO\s+(leads|lead_lists|import_batches|campaigns)\b", statement, re.I))
        if returning and " RETURNING " not in statement.upper():
            statement += " RETURNING id"
        # SQL placeholders in this application occur only in parameterized SQL,
        # and its SQL templates contain no literal question marks.
        cursor = self.raw.execute(statement.replace("?", "%s"), params)
        identifier = cursor.fetchone()["id"] if returning and cursor.rowcount else None
        return Cursor(cursor, identifier)

    def executescript(self, statements):
        for statement in statements.split(";"):
            if statement.strip():
                self.raw.execute(statement)


def connect(url):
    if not url.startswith(("postgresql://", "postgres://")):
        raise ValueError("SUPABASE_DB_URL precisa ser uma URL PostgreSQL do pooler")
    # Supabase's direct endpoint resolves to IPv6 on the Free plan. Vercel's
    # serverless runtime needs the IPv4 shared session pooler for this project.
    # Reuse the password already stored privately in SUPABASE_DB_URL.
    import os
    from psycopg import OperationalError
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    params = conninfo_to_dict(url)
    project = "nhuputjibipbyxtocsac"
    if os.environ.get("VERCEL") and params.get("host", "").endswith(".pooler.supabase.com") and params.get("user") == "postgres":
        # The shared pooler requires the tenant-qualified username even when
        # the direct connection string uses the plain postgres account.
        return Connection(make_conninfo("", **{**params, "user": f"postgres.{project}"}))
    if os.environ.get("VERCEL") and params.get("host") == f"db.{project}.supabase.co" and params.get("user") == "postgres":
        for shard in ("0", "1"):
            pooler = make_conninfo("", **{
                **params, "host": f"aws-{shard}-sa-east-1.pooler.supabase.com",
                "user": f"postgres.{project}", "port": "5432", "sslmode": "require",
            })
            try:
                return Connection(pooler)
            except OperationalError:
                continue
        raise RuntimeError("Pooler IPv4 do Supabase indisponível. Use a URI Session pooler do projeto crm-ecom na Vercel.")
    return Connection(url)
