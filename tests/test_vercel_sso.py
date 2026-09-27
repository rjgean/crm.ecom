"""Verify protected deployment access and origin checks without cloud credentials."""
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server
from server import Handler


class VercelSSOTests(unittest.TestCase):
    def request(self, method, path, host="crm-ecom-ten.vercel.app", headers=None):
        handler = object.__new__(Handler)
        handler.path = "/api" + path
        handler.headers = {"Host": host, **(headers or {})}
        handler.client_address = ("127.0.0.1", 0)
        handler.rfile = io.BytesIO(b"{}")
        handler.wfile = io.BytesIO()
        handler.send_response = lambda status: setattr(handler, "status", status)
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        handler.route(method)
        return handler.status, handler.wfile.getvalue()

    def test_protected_vercel_deployment_needs_no_crm_account(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {"VERCEL": "1", "VERCEL_ENV": "preview"}):
            server.init_db()
            status, body = self.request("GET", "/me")
            self.assertEqual(status, 200)
            self.assertIn(b'"sso": true', body)
            self.assertEqual(self.request("POST", "/login")[0], 404)
            self.assertEqual(self.request("GET", "/me", host="crm.example.com")[0], 403)
            self.assertEqual(self.request("GET", "/me", host="crm-ecom-public.vercel.app")[0], 403)
            self.assertEqual(self.request("POST", "/leads", headers={"X-CSRF-Token": "vercel-sso", "Origin": "https://attacker.test"})[0], 403)
            self.assertEqual(self.request("POST", "/leads", headers={"Origin": "https://crm-ecom-ten.vercel.app"})[0], 403)

    def test_public_host_does_not_inherit_vercel_administrator(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {"VERCEL": "1", "VERCEL_ENV": "production", "CRM_PUBLIC_HOST": "crm-equipe.example.com"}):
            server.init_db()
            self.assertEqual(self.request("GET", "/me", host="crm-equipe.example.com")[0], 401)
            self.assertEqual(self.request("GET", "/me", host="unlisted-project.vercel.app")[0], 403)
            self.assertEqual(self.request("GET", "/me", host="crm-ecom-ten.vercel.app")[0], 200)

    def test_primary_domain_requires_token_when_public_and_preview_retains_sso(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {"VERCEL": "1", "VERCEL_ENV": "production", "CRM_PUBLIC_HOST": "crm-ecom-ten.vercel.app"}):
            server.init_db()
            self.assertEqual(self.request("GET", "/me")[0], 401)
            self.assertEqual(self.request("GET", "/access/status")[0], 200)
            self.assertEqual(self.request("GET", "/me", host="crm-ecom-public.vercel.app")[0], 403)
            with patch.dict(os.environ, {"VERCEL_ENV": "preview"}):
                self.assertEqual(self.request("GET", "/me", host="crm-ecom-preview-orange-even-projects.vercel.app")[0], 200)

    def test_google_login_never_inherits_preview_vercel_admin(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {"VERCEL": "1", "VERCEL_ENV": "preview", "SUPABASE_URL": "https://example.supabase.co", "SUPABASE_PUBLISHABLE_KEY": "sb_publishable_test", "CRM_ADMIN_GOOGLE_EMAIL": "owner@example.com"}):
            server.init_db()
            host = "crm-ecom-git-supabase-google-migration-orange-even-projects.vercel.app"
            self.assertEqual(self.request("GET", "/me", host=host)[0], 401)
            self.assertEqual(self.request("GET", "/auth/config", host=host)[0], 200)
            self.assertEqual(self.request("GET", "/me", host="unlisted-project.vercel.app")[0], 403)


if __name__ == "__main__":
    unittest.main()
