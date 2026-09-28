"""One-time, atomic copy of CRM data from Turso to an empty Supabase database.

Set OLD_TURSO_DATABASE_URL, OLD_TURSO_AUTH_TOKEN, SUPABASE_DB_URL and
CRM_CREDENTIALS_KEY in your private shell environment. Never put them in Git.
"""

import base64
import hashlib
import os
import secrets
from pathlib import Path

import psycopg
from psycopg import sql
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


TABLES = (
    "users", "campaigns", "leads", "observations", "activities", "lead_lists",
    "list_items", "suppression", "app_settings", "collaborators",
    "collaborator_phones", "import_batches", "import_items", "integrations",
)
SEQUENCES = (
    "users", "campaigns", "leads", "observations", "activities", "lead_lists",
    "collaborators", "collaborator_phones", "import_batches",
)


def transfer(src, target, old_key, new_key):
    counts = {}
    old_cipher = AESGCM(hashlib.sha256(b"crm-ecom-credentials-v1:" + old_key.encode()).digest())
    new_cipher = AESGCM(hashlib.sha256(b"crm-ecom-credentials-v1:" + new_key.encode()).digest())
    for table in TABLES:
        src_cursor = src.execute(f"SELECT * FROM {table}")
        columns = [col[0] for col in src_cursor.description]
        values = [tuple(row) for row in src_cursor]
        if table == "integrations":
            name_index, value_index = columns.index("name"), columns.index("secret")
            reencrypted = []
            for row in values:
                row = list(row)
                raw = base64.urlsafe_b64decode(row[value_index])
                secret = old_cipher.decrypt(raw[:12], raw[12:], row[name_index].encode())
                nonce = secrets.token_bytes(12)
                row[value_index] = base64.urlsafe_b64encode(nonce + new_cipher.encrypt(nonce, secret, row[name_index].encode())).decode()
                reencrypted.append(tuple(row))
            values = reencrypted
        if values:
            insert = sql.SQL("INSERT INTO crm.{} ({}) VALUES ({})").format(
                sql.Identifier(table),
                sql.SQL(",").join(map(sql.Identifier, columns)),
                sql.SQL(",").join(sql.Placeholder() for _ in columns),
            )
            with target.cursor() as cursor:
                cursor.executemany(insert, values)
        counts[table] = len(values)
        with target.cursor() as cursor:
            cursor.execute(sql.SQL("SELECT COUNT(*) FROM crm.{}").format(sql.Identifier(table)))
            actual = cursor.fetchone()[0]
        if actual != counts[table]:
            raise RuntimeError(f"Contagem divergente em {table}: origem {counts[table]}, destino {actual}")
    for table in SEQUENCES:
        with target.cursor() as cursor:
            cursor.execute("SELECT setval(pg_get_serial_sequence(%s,%s), COALESCE((SELECT MAX(id) FROM crm." + table + "),1), EXISTS(SELECT 1 FROM crm." + table + "))", ("crm." + table, "id"))
    return counts


def main():
    import turso_serverless

    source_url = os.environ["OLD_TURSO_DATABASE_URL"]
    source_token = os.environ["OLD_TURSO_AUTH_TOKEN"]
    destination = os.environ["SUPABASE_DB_URL"]
    new_key = os.environ["CRM_CREDENTIALS_KEY"]
    old_key = os.environ.get("OLD_CRM_CREDENTIALS_KEY") or source_token
    if len(new_key) < 32 or len(old_key) < 32:
        raise RuntimeError("As chaves de criptografia precisam ter ao menos 32 caracteres")
    if not destination.startswith(("postgres://", "postgresql://")):
        raise RuntimeError("SUPABASE_DB_URL deve ser uma conexão PostgreSQL privada")

    src = turso_serverless.connect(source_url, auth_token=source_token)
    with psycopg.connect(destination, connect_timeout=10) as target:
        schema = (Path(__file__).resolve().parent / "schema" / "supabase.sql").read_text()
        for statement in schema.split(";"):
            if statement.strip():
                target.execute(statement)
        for table in (*TABLES, "google_users", "google_sessions", "oauth_states"):
            with target.cursor() as cursor:
                cursor.execute(sql.SQL("SELECT EXISTS(SELECT 1 FROM crm.{} LIMIT 1)").format(sql.Identifier(table)))
                if cursor.fetchone()[0]:
                    raise RuntimeError("O banco de destino já tem dados; a importação exige um banco CRM vazio")
        counts = transfer(src, target, old_key, new_key)
    src.close()
    for name, count in counts.items():
        print(f"{name}: {count} registros conferidos")
    print("Transferência concluída; confirme o login antes de mudar a produção.")


if __name__ == "__main__":
    main()
