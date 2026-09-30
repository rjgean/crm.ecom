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
        self.assertIn("crm-shell-v2", script)
        self.assertIn("cache: 'no-store'", script)
        self.assertIn(".catch(() => caches.match(request))", script)
        self.assertNotIn("/api/me", script)
        self.assertNotIn("/api/leads", script)

    def test_deployed_shell_copies_stay_in_sync(self):
        for name in ("app.js", "sw.js", "styles.css"):
            with self.subTest(asset=name):
                self.assertEqual((ROOT / "static" / name).read_bytes(), (ROOT / "public" / name).read_bytes())

    def test_scrollbar_palette_follows_light_and_dark_themes(self):
        styles = (ROOT / "static" / "styles.css").read_text()
        self.assertIn("scrollbar-color:var(--scroll-thumb) var(--scroll-track)", styles)
        self.assertIn("--scroll-thumb:#397f75", styles)
        self.assertIn("[data-theme=light]{--scroll-thumb:#9aacc1;--scroll-track:#edf2f7;--scroll-border:#f4f7fb;--scroll-hover:#145bd7;--scroll-active:#0f4db9}", styles)

    def test_lead_score_is_labeled_and_visible_on_mobile(self):
        script = (ROOT / "static" / "app.js").read_text()
        styles = (ROOT / "static" / "styles.css").read_text()
        self.assertIn("<small>Score do lead</small>", script)
        self.assertIn("Indicador interno para ajudar a priorizar oportunidades", script)
        self.assertNotIn(".dash-lead-stage,.dash-lead-score,.topbar-actions form{display:none}", styles)

    def test_lead_cards_align_metadata_and_actions(self):
        styles = (ROOT / "static" / "styles.css").read_text()
        self.assertIn(".lead-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))", styles)
        self.assertIn(".lead-actions .btn{flex:1 1 108px;min-height:38px", styles)

    def test_local_review_tool_is_labeled_nfc_qr_and_has_mobile_copy_guidance(self):
        script = (ROOT / "static" / "app.js").read_text()
        self.assertIn("['qr','qr','NFC/QR'", script)
        self.assertIn("Copiar link NFC/QR", script)
        self.assertIn("grave como URL em uma etiqueta compatível usando um aplicativo NFC no celular", script)
        self.assertIn("Google Maps", script[script.index("function reviewQrPage"):script.index("async function crmPage")])

    def test_sidebar_scroll_position_survives_section_navigation(self):
        script = (ROOT / "static" / "app.js").read_text()
        self.assertIn("navScrollTop: 0", script)
        self.assertIn("const previousNavScroll=document.querySelector('.nav')?.scrollTop??state.navScrollTop", script)
        self.assertIn("newNav.scrollTop=previousNavScroll", script)


if __name__ == "__main__":
    unittest.main()
