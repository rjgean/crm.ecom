"""The internal CRM uses one password, including on Vercel deployments."""
import os
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import server


class PasswordAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = patch.object(server, "DB_PATH", Path(self.temp.name) / "crm.sqlite3")
        self.secure_cookie = patch.object(server, "COOKIE_SECURE", True)
        self.environment = patch.dict(os.environ, {
            "VERCEL": "1", "VERCEL_ENV": "production", "CRM_PUBLIC_HOST": "crm-ecom-ten.vercel.app",
            "ADMIN_EMAIL": "gean@example.com", "ADMIN_PASSWORD": "InitialPassword123456!",
            "SUPABASE_URL": "https://example.supabase.co",
        }, clear=True)
        self.database.start()
        self.secure_cookie.start()
        self.environment.start()
        server.init_db()
        self.cookie = ""

    def tearDown(self):
        self.environment.stop()
        self.secure_cookie.stop()
        self.database.stop()
        self.temp.cleanup()

    def request(self, path, *, method="GET", payload=None, origin="https://crm-ecom-ten.vercel.app", csrf=""):
        handler = object.__new__(server.Handler)
        handler.path = "/api" + path
        body = json.dumps(payload or {}).encode()
        handler.headers = {"Host": "crm-ecom-ten.vercel.app", "Origin": origin, "Cookie": self.cookie,
                           "Content-Length": str(len(body)), "X-CSRF-Token": csrf}
        handler.client_address = ("127.0.0.1", 0)
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.send_response = lambda status: setattr(handler, "status", status)
        sent = []
        handler.send_header = lambda name, value: sent.append((name, value))
        handler.end_headers = lambda: None
        handler.route(method)
        headers = dict(sent)
        if "Set-Cookie" in headers: self.cookie = headers["Set-Cookie"].split(";", 1)[0]
        raw = handler.wfile.getvalue()
        return SimpleNamespace(status_code=handler.status, json=json.loads(raw) if raw else {}, headers=headers)

    def test_password_login_and_legacy_access_disabled(self):
        self.assertEqual(self.request("/me").status_code, 401)
        self.assertEqual(self.request("/auth/config").json, {"password": True, "available": True})
        self.assertEqual(self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "bad"}).status_code, 401)
        self.assertEqual(self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "InitialPassword123456!"}, origin="https://other.example").status_code, 403)
        logged_in = self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "InitialPassword123456!"})
        self.assertEqual(logged_in.status_code, 200)
        self.assertIn("HttpOnly", logged_in.headers["Set-Cookie"])
        self.assertIn("Secure", logged_in.headers["Set-Cookie"])
        me = self.request("/me")
        self.assertEqual((me.status_code, me.json["role"], me.json["email"]), (200, "admin", "gean@example.com"))
        self.assertEqual(self.request("/access/settings").status_code, 404)
        self.assertEqual(self.request("/auth/google/start").status_code, 404)
        self.assertEqual(self.request("/dashboard").status_code, 200)
        self.assertEqual(self.request("/logout", method="POST").status_code, 403)
        self.assertEqual(self.request("/logout", method="POST", csrf=me.json["csrf"]).status_code, 200)
        self.assertEqual(self.request("/me").status_code, 401)

    def test_password_rotation_in_hosting_settings_revokes_sessions(self):
        login = self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "InitialPassword123456!"})
        self.assertEqual(login.status_code, 200)
        with patch.dict(os.environ, {"ADMIN_PASSWORD": "RotatedPassword654321!"}):
            server.init_db()
            self.assertEqual(self.request("/me").status_code, 401)
            self.assertEqual(self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "InitialPassword123456!"}).status_code, 401)
            self.assertEqual(self.request("/login", method="POST", payload={"email": "gean@example.com", "password": "RotatedPassword654321!"}).status_code, 200)
            server.init_db()
            self.assertEqual(self.request("/me").status_code, 200)


if __name__ == "__main__":
    unittest.main()
