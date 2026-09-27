"""Roles and PKCE login must never grant admin to an unlisted Google account."""
import hashlib
import io
import json
import os
import tempfile
import unittest
import urllib.parse
from pathlib import Path
from unittest.mock import patch

import server
import supabase_auth


class GoogleAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = patch.object(server, "DB_PATH", Path(self.temp.name) / "crm.sqlite3")
        self.environment = patch.dict(os.environ, {
            "VERCEL": "1", "VERCEL_ENV": "production", "CRM_PUBLIC_HOST": "crm-ecom-ten.vercel.app",
            "SUPABASE_URL": "https://example.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test",
            "CRM_ADMIN_GOOGLE_EMAIL": "owner@example.com",
        })
        self.database.start()
        self.environment.start()
        server.init_db()

    def tearDown(self):
        self.environment.stop()
        self.database.stop()
        self.temp.cleanup()

    def request(self, method, path, *, cookie="", csrf="", body=None):
        handler = object.__new__(server.Handler)
        handler.path = "/api" + path
        handler.headers = {
            "Host": "crm-ecom-ten.vercel.app", "Origin": "https://crm-ecom-ten.vercel.app",
            "Cookie": cookie, "X-CSRF-Token": csrf,
        }
        handler.client_address = ("127.0.0.1", 0)
        handler.rfile = io.BytesIO(json.dumps(body or {}).encode())
        handler.headers["Content-Length"] = str(handler.rfile.getbuffer().nbytes)
        handler.wfile = io.BytesIO()
        handler.send_response = lambda status: setattr(handler, "status", status)
        handler.sent_headers = []
        handler.send_header = lambda name, value: handler.sent_headers.append((name, value))
        handler.end_headers = lambda: None
        handler.route(method)
        payload = handler.wfile.getvalue()
        return handler.status, json.loads(payload) if payload else None, dict(handler.sent_headers), handler.sent_headers

    def session(self, email):
        token, csrf = email + "-session", email + "-csrf"
        with server.db() as con:
            con.execute("INSERT INTO google_sessions(token_hash,email,csrf,expires_at) VALUES(?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), email, csrf, (server.datetime.now(server.timezone.utc) + server.timedelta(days=1)).isoformat()))
        return "crm_session=" + token, csrf

    def test_owner_and_authorized_collaborator_have_distinct_roles(self):
        admin_cookie, admin_csrf = self.session("owner@example.com")
        other_cookie, other_csrf = self.session("collaborator@example.com")
        self.assertEqual(self.request("GET", "/me", cookie=admin_cookie)[1]["role"], "admin")
        self.assertEqual(self.request("GET", "/me", cookie=other_cookie)[0], 401)
        self.assertEqual(self.request("POST", "/access/google-users", cookie=admin_cookie, csrf="wrong", body={"email": "collaborator@example.com"})[0], 403)
        expiry = (server.datetime.now(server.timezone.utc) + server.timedelta(days=2)).isoformat()
        self.assertEqual(self.request("POST", "/access/google-users", cookie=admin_cookie, csrf=admin_csrf, body={"email": "collaborator@example.com", "expires_at": expiry})[0], 201)
        self.assertEqual(self.request("GET", "/me", cookie=other_cookie)[1]["role"], "collaborator")
        self.assertEqual(self.request("POST", "/access/google-users", cookie=other_cookie, csrf=other_csrf, body={"email": "another@example.com", "expires_at": expiry})[0], 403)
        self.assertEqual(self.request("GET", "/access/google-users", cookie=other_cookie)[0], 403)
        self.assertEqual(self.request("POST", "/integrations", cookie=other_cookie, csrf=other_csrf, body={"service": "apify", "token": "untrusted-token"})[0], 403)
        users = self.request("GET", "/access/google-users", cookie=admin_cookie)[1]
        self.assertEqual(self.request("DELETE", "/access/google-users/" + str(users[0]["id"]), cookie=admin_cookie, csrf=admin_csrf)[0], 200)
        self.assertEqual(self.request("GET", "/me", cookie=other_cookie)[0], 401)

    def test_oauth_state_is_single_use_and_owner_only(self):
        status, _, headers, pairs = self.request("GET", "/auth/google/start")
        self.assertEqual(status, 303)
        self.assertIn("code_challenge_method=s256", headers["Location"])
        cookie = next(value.split(";", 1)[0] for name, value in pairs if name == "Set-Cookie" and value.startswith("crm_oauth="))
        with patch.object(supabase_auth, "exchange", return_value="owner@example.com") as exchange:
            status, _, _, sent = self.request("GET", "/auth/google/callback?code=google-auth-code", cookie=cookie)
            self.assertEqual(status, 303)
            self.assertTrue(any(value.startswith("crm_session=") for name, value in sent if name == "Set-Cookie"))
            self.assertEqual(exchange.call_count, 1)
            self.assertEqual(self.request("GET", "/auth/google/callback?code=google-auth-code", cookie=cookie)[2]["Location"], "/?auth_error=1")

    def test_unknown_google_user_cannot_create_session(self):
        _, _, headers, pairs = self.request("GET", "/auth/google/start")
        cookie = next(value.split(";", 1)[0] for name, value in pairs if name == "Set-Cookie" and value.startswith("crm_oauth="))
        with patch.object(supabase_auth, "exchange", return_value="stranger@example.com"):
            status, _, headers, sent = self.request("GET", "/auth/google/callback?code=google-auth-code", cookie=cookie)
        self.assertEqual((status, headers["Location"]), (303, "/?auth_error=2"))
        self.assertFalse(any(value.startswith("crm_session=") for name, value in sent if name == "Set-Cookie"))


if __name__ == "__main__":
    unittest.main()
