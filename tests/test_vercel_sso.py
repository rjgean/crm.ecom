"""Only the expected production and preview domains may call the CRM API."""
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import server


class VercelHostTests(unittest.TestCase):
    def request(self, path, host):
        handler = object.__new__(server.Handler)
        handler.path = "/api" + path
        handler.headers = {"Host": host}
        handler.client_address = ("127.0.0.1", 0)
        handler.rfile = io.BytesIO()
        handler.wfile = io.BytesIO()
        handler.send_response = lambda status: setattr(handler, "status", status)
        handler.send_header = lambda *args: None
        handler.end_headers = lambda: None
        handler.route("GET")
        return handler.status

    def test_no_vercel_admin_bypass(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {
            "VERCEL": "1", "VERCEL_ENV": "production", "ADMIN_EMAIL": "gean@example.com", "ADMIN_PASSWORD": "InitialPassword123456!",
        }, clear=True):
            server.init_db()
            self.assertEqual(self.request("/me", "crm-ecom-ten.vercel.app"), 401)
            self.assertEqual(self.request("/me", "wrong.vercel.app"), 403)
            with patch.dict(os.environ, {"VERCEL_ENV": "preview"}):
                self.assertEqual(self.request("/me", "crm-ecom-any-orange-even-projects.vercel.app"), 401)


if __name__ == "__main__":
    unittest.main()
