"""Check SQL compatibility and reject unverified Google identities."""
import unittest
import sys
from types import ModuleType
from unittest.mock import patch
from urllib.parse import urlsplit

from postgres_backend import Connection, HybridRow
import postgres_backend
import supabase_auth


class FakeCursor:
    def __init__(self, rows=(), rowcount=0):
        self.rows = iter(rows)
        self.rowcount = rowcount

    def fetchone(self):
        return next(self.rows, None)


class FakeRaw:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        if sql.endswith("RETURNING id"):
            return FakeCursor([{"id": 42}], 1)
        if sql.startswith("SELECT"):
            return FakeCursor([{"id": 42, "name": "Loja"}], 1)
        return FakeCursor((), 0)


class AdapterTests(unittest.TestCase):
    def test_vercel_qualifies_pooler_username(self):
        psycopg = ModuleType("psycopg")
        conninfo = ModuleType("psycopg.conninfo")
        psycopg.OperationalError = Exception
        conninfo.conninfo_to_dict = lambda url: {
            "host": urlsplit(url).hostname, "user": urlsplit(url).username,
            "password": urlsplit(url).password, "dbname": urlsplit(url).path.lstrip("/"),
        }
        conninfo.make_conninfo = lambda _unused, **params: params
        url = "postgresql://postgres:test-password@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
        with patch.dict(sys.modules, {"psycopg": psycopg, "psycopg.conninfo": conninfo}), patch.dict("os.environ", {"VERCEL": "1"}), patch.object(postgres_backend, "Connection") as connection:
            postgres_backend.connect(url)
            connection.assert_called_once()
            self.assertEqual(connection.call_args.args[0]["user"], "postgres.nhuputjibipbyxtocsac")
            self.assertEqual(connection.call_args.args[0]["password"], "test-password")

    def test_vercel_uses_ipv4_session_pooler_with_existing_credentials(self):
        direct = "postgresql://postgres:test-password@db.nhuputjibipbyxtocsac.supabase.co:5432/postgres"
        psycopg = ModuleType("psycopg")
        conninfo = ModuleType("psycopg.conninfo")
        class OperationalError(Exception):
            pass
        psycopg.OperationalError = OperationalError
        conninfo.conninfo_to_dict = lambda url: {
            "host": urlsplit(url).hostname, "user": urlsplit(url).username,
            "password": urlsplit(url).password, "dbname": urlsplit(url).path.lstrip("/"),
        }
        conninfo.make_conninfo = lambda _unused, **params: params
        with patch.dict(sys.modules, {"psycopg": psycopg, "psycopg.conninfo": conninfo}), patch.dict("os.environ", {"VERCEL": "1"}), patch.object(postgres_backend, "Connection") as connection:
            expected = object()
            connection.side_effect = [OperationalError("unavailable"), expected]
            result = postgres_backend.connect(direct)
            self.assertIs(result, expected)
            self.assertEqual(connection.call_count, 2)
            first, second = (call.args[0] for call in connection.call_args_list)
            self.assertEqual([first["host"], second["host"]], [
                "aws-0-sa-east-1.pooler.supabase.com", "aws-1-sa-east-1.pooler.supabase.com"
            ])
            self.assertEqual(first["user"], "postgres.nhuputjibipbyxtocsac")
            self.assertEqual(first["password"], "test-password")
            self.assertEqual(first["port"], "5432")
            self.assertEqual(first["sslmode"], "require")
            self.assertIsNotNone(result)

    def test_sqlite_style_insert_and_rows_work_with_postgres(self):
        connection = object.__new__(Connection)
        connection.raw = FakeRaw()
        inserted = connection.execute("INSERT INTO leads(name,name_key) VALUES(?,?)", ("Loja", "loja"))
        self.assertEqual(inserted.lastrowid, 42)
        self.assertEqual(connection.raw.calls[0], ("INSERT INTO leads(name,name_key) VALUES(%s,%s) RETURNING id", ("Loja", "loja")))
        connection.execute("INSERT OR IGNORE INTO list_items(list_id,lead_id) VALUES(?,?)", (1, 42))
        self.assertEqual(connection.raw.calls[1][0], "INSERT INTO list_items(list_id,lead_id) VALUES(%s,%s) ON CONFLICT DO NOTHING")
        row = connection.execute("SELECT id,name FROM leads WHERE id=?", (42,)).fetchone()
        self.assertEqual((row[0], row["name"], dict(row)), (42, "Loja", {"id": 42, "name": "Loja"}))

    def test_google_provider_and_confirmed_email_are_required(self):
        with patch.dict("os.environ", {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test", "CRM_ADMIN_GOOGLE_EMAIL": "owner@example.com"}):
            session = {"access_token": "test-only"}
            valid = {"email": "OWNER@example.com", "email_confirmed_at": "2026-09-01", "app_metadata": {"providers": ["google"]}}
            with patch.object(supabase_auth, "fetch_json", side_effect=[session, valid]):
                self.assertEqual(supabase_auth.exchange("code", "verifier"), "owner@example.com")
            for rejected in ({**valid, "email_confirmed_at": None}, {**valid, "app_metadata": {"providers": ["email"]}}):
                with self.subTest(rejected=rejected), patch.object(supabase_auth, "fetch_json", side_effect=[session, rejected]):
                    with self.assertRaises(ValueError):
                        supabase_auth.exchange("code", "verifier")


if __name__ == "__main__":
    unittest.main()
