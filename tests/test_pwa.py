import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

import server


ROOT = Path(__file__).resolve().parents[1]


class PWATests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join(timeout=2)

    def test_manifest_declares_mobile_install_and_owned_icons(self):
        manifest = json.loads((ROOT / "static" / "manifest.webmanifest").read_text())
        self.assertEqual(manifest["start_url"], "/")
        self.assertEqual(manifest["scope"], "/")
        self.assertEqual(manifest["display"], "standalone")
        self.assertIn({"src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"}, manifest["icons"])
        for item in manifest["icons"]:
            self.assertTrue((ROOT / "static" / item["src"].lstrip("/")).is_file())

    def test_static_pwa_assets_are_served_without_a_database_session(self):
        expected = {
            "/manifest.webmanifest": "application/manifest+json",
            "/sw.js": "text/javascript",
            "/icon-192.png": "image/png",
            "/icon-512.png": "image/png",
            "/icon-maskable-512.png": "image/png",
        }
        for path, content_type in expected.items():
            with self.subTest(path=path):
                connection = http.client.HTTPConnection("127.0.0.1", self.http.server_port)
                connection.request("GET", path)
                response = connection.getresponse()
                body = response.read()
                self.assertEqual(response.status, 200)
                self.assertIn(content_type, response.getheader("Content-Type"))
                self.assertTrue(body)
                connection.close()

    def test_service_worker_only_caches_public_shell_and_bypasses_api(self):
        script = (ROOT / "static" / "sw.js").read_text()
        self.assertIn("request.method !== 'GET'", script)
        self.assertIn("url.pathname.startsWith('/api/')", script)
        self.assertIn("url.pathname.startsWith('/r/')", script)
        self.assertIn("const SHELL =", script)
        self.assertNotIn("/api/me", script)
        self.assertNotIn("/api/leads", script)


if __name__ == "__main__":
    unittest.main()
