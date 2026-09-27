import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ADMIN_EMAIL", "operator@example.test")
os.environ.setdefault("ADMIN_PASSWORD", "TestingPassphrase123!")
import server


class CRMTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.DB_PATH = Path(cls.temp.name) / "crm.sqlite3"
        server.init_db()
        cls.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.temp.cleanup()

    def setUp(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def request(self, method, path, body=None, with_csrf=True):
        headers = {"Content-Type": "application/json"}
        if self.csrf and with_csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(self.base + "/api" + path, data=json.dumps(body).encode() if body is not None else None, headers=headers, method=method)
        try:
            response = self.opener.open(req, timeout=5)
            raw = response.read()
            if response.headers.get("Content-Type", "").startswith("text/csv"):
                return response.status, raw.decode("utf-8-sig")
            return response.status, json.loads(raw)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def login(self):
        status, value = self.request("POST", "/login", {"email": "operator@example.test", "password": "TestingPassphrase123!"})
        self.assertEqual(status, 200)
        self.csrf = value["csrf"]

    def test_groq_draft_requires_real_preview_for_ready_site_claim(self):
        self.login()
        _, lead = self.request("POST", "/leads", {"name": "Loja Aurora", "city": "Niterói", "state": "RJ", "phone": "21999998888"})
        path = f"/leads/{lead['id']}/message-draft"
        with patch.dict(os.environ, {"GROQ_API_KEY": "test-groq-credential", "CRM_CREDENTIALS_KEY": "long-local-encryption-key-for-tests-abc"}):
            self.assertEqual(self.request("POST", path, {}, with_csrf=False)[0], 403)
            self.assertEqual(self.request("POST", path, {"preview_url": "https://preview.example"})[0], 400)
            with patch.object(server, "request_json", return_value={"choices": [{"message": {"content": "Olá, Loja Aurora! Já criei seu site personalizado. Quer ver?"}}]}):
                self.assertEqual(self.request("POST", path, {})[0], 502)
            real = {"contact_name": "Ana", "instagram_observation": "Coleção de vestidos no Instagram", "preview_url": "https://preview.example", "preview_confirmed": True, "images_confirmed": True}
            generated = "Ana, a coleção de vestidos da Loja Aurora merece uma vitrine! Criei uma prévia com as imagens da loja, sem custo: https://preview.example. Posso te mostrar?"
            with patch.object(server, "request_json", return_value={"choices": [{"message": {"content": generated}}]}) as provider:
                status, result = self.request("POST", path, real)
                self.assertEqual(status, 200)
                self.assertEqual(result["message"], generated)
                self.assertEqual(provider.call_args.args[0], "https://api.groq.com/openai/v1/chat/completions")
                self.assertEqual(provider.call_args.args[2]["model"], "openai/gpt-oss-20b")
                self.assertIn('"nome_pessoa_confirmado": "Ana"', provider.call_args.args[2]["messages"][1]["content"])
            with patch.object(server, "request_json", side_effect=urllib.error.HTTPError("https://api.groq.com", 429, "Too Many Requests", {}, None)):
                status, message = self.request("POST", path, {})
                self.assertEqual(status, 429)
                self.assertIn("Limite gratuito", message["error"])

    def test_integration_credentials_are_encrypted_and_never_returned(self):
        self.login()
        secret = "apify-test-only-long-secret-123"
        with patch.dict(os.environ, {"CRM_CREDENTIALS_KEY": "local-credential-encryption-key-32bytes!", "APIFY_TOKEN": ""}):
            self.assertEqual(self.request("POST", "/integrations", {"service": "apify", "token": secret}, with_csrf=False)[0], 403)
            status, result = self.request("POST", "/integrations", {"service": "apify", "token": secret})
            self.assertEqual(status, 200)
            self.assertNotIn(secret, json.dumps(result))
            with server.db() as con:
                saved = con.execute("SELECT secret FROM integrations WHERE name='apify'").fetchone()[0]
            self.assertNotIn(secret, saved)
            self.assertEqual(server.service_key("apify"), secret)
            _, me = self.request("GET", "/me")
            self.assertTrue(me["apify"])
            self.assertNotIn(secret, json.dumps(me))
            self.assertEqual(self.request("DELETE", "/integrations/apify")[0], 200)
            self.assertEqual(server.service_key("apify"), "")

    def test_manual_apify_json_import_and_staged_firecrawl(self):
        self.login()
        rows = {"items": [
            {"title": "Boutique Estrela", "placeId": "json-boutique-1", "categoryName": "Loja de roupas", "phone": "21987654321", "website": "https://boutique-estrela.example", "totalScore": 4.8},
            {"title": "Boutique Estrela", "placeId": "json-boutique-1"},
            {"title": "Moda Horizonte", "placeId": "json-moda-2", "phone": "21999997777", "website": "https://instagram.com/modahorizonte"},
        ]}
        with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-only"}):
            payload = {"json": json.dumps(rows), "city": "Rio de Janeiro", "state": "RJ", "name": "Roupas RJ"}
            self.assertEqual(self.request("POST", "/import-apify", payload, with_csrf=False)[0], 403)
            status, batch = self.request("POST", "/import-apify", payload)
            self.assertEqual(status, 201)
            self.assertEqual((batch["received"], batch["total"], batch["created"]), (3, 2, 2))
            self.assertEqual(self.request("POST", "/import-apify", {"json": "invalid"})[0], 400)
            with patch.object(server, "request_json", side_effect=[{"success": True, "data": {"web": []}}, {"success": True, "data": {"web": []}}]) as provider:
                first = self.request("POST", f"/import-apify/{batch['id']}/advance")[1]
                self.assertEqual(first["processed"], 1)
                result = self.request("POST", f"/import-apify/{batch['id']}/advance")[1]
                self.assertEqual(provider.call_count, 2)
            self.assertEqual(result["status"], "done")
            self.assertEqual((result["processed"], result["enriched"], result["failed"]), (2, 2, 0))
            self.assertEqual([row["digital_status"] for row in result["items"]], ["site_sem_loja", "apenas_redes"])
            self.assertEqual(result["items"][1]["city"], "Rio de Janeiro")

    def test_manual_import_pauses_when_firecrawl_rate_limits(self):
        self.login()
        with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-only"}):
            _, batch = self.request("POST", "/import-apify", {"json": '[{"title":"Ateliê Prisma","placeId":"json-prisma-429"}]'})
            rate_limit = urllib.error.HTTPError("https://api.firecrawl.dev/v2/search", 429, "limit", {}, None)
            with patch.object(server, "request_json", side_effect=rate_limit):
                status, paused = self.request("POST", f"/import-apify/{batch['id']}/advance")
            self.assertEqual((status, paused["status"], paused["processed"]), (200, "paused", 0))
            self.assertEqual(paused["items"][0]["status"], "pending")
            self.assertEqual(self.request("POST", f"/import-apify/{batch['id']}/resume")[1]["status"], "queued")
            with patch.object(server, "request_json", return_value={"success": True, "data": {"web": []}}):
                done = self.request("POST", f"/import-apify/{batch['id']}/advance")[1]
            self.assertEqual(done["status"], "done")
            self.assertEqual(done["items"][0]["digital_status"], "incerto")

    def test_instagram_search_uses_address_and_needs_confirmation(self):
        self.login()
        _, lead = self.request("POST", "/leads", {"name": "Ateliê Aurora", "address": "Rua das Palmeiras 42", "city": "Niterói", "state": "RJ"})
        hits = {"success": True, "data": {"web": [
            {"url": "https://www.instagram.com/atelieaurora/", "title": "Ateliê Aurora em Niterói", "description": "Loja na Rua das Palmeiras"},
            {"url": "https://www.instagram.com/atelieoutra/", "title": "Ateliê Outra em São Paulo"},
            {"url": "https://www.instagram.com/p/fotopost/", "title": "Ateliê Aurora em Niterói"},
        ]}}
        with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-only"}), patch.object(server, "request_json", return_value=hits) as provider:
            status, found = self.request("POST", f"/leads/{lead['id']}/instagram", {})
        self.assertEqual(status, 200)
        self.assertIn("Rua das Palmeiras 42", provider.call_args.args[2]["query"])
        self.assertEqual([item["url"] for item in found["candidates"]], ["https://www.instagram.com/atelieaurora/"])
        _, before = self.request("GET", f"/leads/{lead['id']}")
        self.assertFalse(before["instagram"])
        self.assertEqual(self.request("POST", f"/leads/{lead['id']}/instagram/confirm", {"url": "https://www.instagram.com/nao-pesquisado/"})[0], 400)
        status, saved = self.request("POST", f"/leads/{lead['id']}/instagram/confirm", {"url": found["candidates"][0]["url"]})
        self.assertEqual(status, 200)
        self.assertEqual(saved["instagram"], "https://www.instagram.com/atelieaurora/")
        self.assertEqual(saved["digital_status"], "apenas_redes")

    def test_instagram_search_falls_back_to_city(self):
        self.login()
        _, lead = self.request("POST", "/leads", {"name": "Aurora Bordados", "address": "Rua Alfa 19", "city": "Niterói", "state": "RJ"})
        hit = {"success": True, "data": {"web": [{"url": "https://instagram.com/aurorabordados", "title": "Aurora Bordados Niterói"}]}}
        with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-only"}), patch.object(server, "request_json", side_effect=[{"success": True, "data": {"web": []}}, hit]) as provider:
            _, result = self.request("POST", f"/leads/{lead['id']}/instagram", {})
        self.assertEqual(provider.call_count, 2)
        self.assertIn('"Niterói"', provider.call_args_list[1].args[2]["query"])
        self.assertEqual(len(result["candidates"]), 1)

    def test_login_csrf_crud_and_export(self):
        self.assertEqual(self.request("GET", "/leads")[0], 401)
        self.assertEqual(self.request("POST", "/login", {"email": "operator@example.test", "password": "wrong"})[0], 401)
        self.login()
        self.assertEqual(self.request("POST", "/leads", {"name": "Loja Exemplo"}, with_csrf=False)[0], 403)
        item = {"name": "Loja Exemplo", "city": "São Gonçalo", "state": "RJ", "phone": "(21) 99876-1234", "category": "Vestuário"}
        status, first = self.request("POST", "/leads", item)
        self.assertEqual(status, 201)
        status, repeated = self.request("POST", "/leads", item)
        self.assertEqual(status, 200)
        self.assertEqual(first["id"], repeated["id"])
        status, detail = self.request("GET", f"/leads/{first['id']}")
        self.assertEqual(detail["whatsapp"], "5521998761234")
        self.assertEqual(detail["digital_status"], "incerto")
        status, changed = self.request("PATCH", f"/leads/{first['id']}", {"stage": "proposta", "digital_status": "apenas_redes", "amount": 2200})
        self.assertEqual(changed["stage"], "proposta")
        self.assertEqual(changed["reviewed"], 1)
        self.assertEqual(changed["amount"], 2200)
        self.assertTrue(any(a["kind"] == "etapa" for a in changed["activities"]))
        self.assertEqual(self.request("POST", f"/leads/{first['id']}/activity", {"kind": "ligacao", "detail": "Voltar amanhã"})[0], 200)
        _, created_list = self.request("POST", "/lists", {"name": "Campanha RJ"})
        self.assertEqual(self.request("POST", f"/lists/{created_list['id']}/items", {"lead_id": first["id"]})[0], 200)
        _, filtered = self.request("GET", f"/leads?list_id={created_list['id']}")
        self.assertEqual(filtered["total"], 1)
        status, overview = self.request("GET", "/dashboard")
        self.assertGreaterEqual(overview["metrics"]["contacted"], 1)
        self.assertGreaterEqual(overview["metrics"]["proposals"], 1)
        status, csv_data = self.request("GET", "/export")
        self.assertIn("Loja Exemplo", csv_data)

    def test_csv_import_block_and_missing_provider(self):
        self.login()
        status, result = self.request("POST", "/import", {"csv": "name,city,state,phone\nTeste Bloqueio,Recife,PE,81999998888\n"})
        self.assertEqual(result["created"], 1)
        status, rows = self.request("GET", "/leads?q=Teste%20Bloqueio")
        lead_id = rows["items"][0]["id"]
        self.assertEqual(self.request("POST", f"/leads/{lead_id}/block", {})[0], 200)
        status, result = self.request("POST", "/import", {"csv": "name,city,state,phone\nTeste Bloqueio,Recife,PE,81999998888\n"})
        self.assertEqual(result["created"], 0)
        with patch.dict(os.environ, {"APIFY_TOKEN": ""}):
            self.assertEqual(self.request("POST", "/campaigns", {"niche": "barbearia", "city": "Recife", "state": "PE"})[0], 400)

    def test_enrichment_keeps_uncertainty_and_sources(self):
        self.login()
        _, created = self.request("POST", "/leads", {"name": "Oficina Primavera", "city": "São Gonçalo", "state": "RJ", "phone": "21990001122"})
        fake = {"success": True, "data": {"web": [{"url": "https://instagram.com/oficinaprimavera", "title": "Oficina Primavera em São Gonçalo", "description": "Fotos e contato"}, {"url": "https://diretorio.example/oficina-primavera", "title": "Oficina Primavera", "description": "Listagem comercial"}]}}
        with patch.dict(os.environ, {"FIRECRAWL_API_KEY": "test-only"}), patch.object(server, "request_json", return_value=fake):
            self.assertTrue(server.enrich_lead(created["id"]))
        _, detail = self.request("GET", f"/leads/{created['id']}")
        self.assertEqual(detail["digital_status"], "apenas_redes")
        self.assertTrue(any(o["source_url"].startswith("https://instagram.com/") for o in detail["observations"]))
        self.assertFalse(detail["reviewed"])

    def test_campaign_imports_provider_dataset_then_enriches(self):
        self.login()
        with patch.dict(os.environ, {"APIFY_TOKEN": "test-only", "FIRECRAWL_API_KEY": "test-only"}):
            status, campaign = self.request("POST", "/campaigns", {"niche": "papelaria", "city": "Niterói", "state": "RJ", "limit": 2})
            self.assertEqual(status, 201)
            provider_results = [
                {"data": {"id": "mock-run"}},
                {"data": {"id": "mock-run", "status": "SUCCEEDED", "defaultDatasetId": "mock-dataset"}},
                [{"title": "Papelaria Sol Niterói", "placeId": "place-test-1", "phone": "21987651234", "url": "https://maps.google.com/?id=1", "reviewsCount": 12}],
                {"success": True, "data": {"web": [{"url": "https://instagram.com/papelariasol", "title": "Papelaria Sol Niterói", "description": "Loja local"}]}}
            ]
            with patch.object(server, "request_json", side_effect=provider_results) as provider:
                with server.db() as con:
                    row = dict(con.execute("SELECT * FROM campaigns WHERE id=?", (campaign["id"],)).fetchone())
                server.run_campaign(row)
                self.assertEqual(provider.call_count, 4)
                self.assertEqual(provider.call_args_list[0].args[2]["language"], "pt-BR")
            _, campaigns = self.request("GET", "/campaigns")
            done = next(x for x in campaigns if x["id"] == campaign["id"])
            self.assertEqual(done["status"], "done")
            self.assertEqual((done["found"], done["saved"], done["enriched"]), (1, 1, 1))
            _, leads = self.request("GET", "/leads?q=Papelaria%20Sol")
            self.assertEqual(leads["items"][0]["digital_status"], "apenas_redes")

    def test_password_change_invalidates_sessions(self):
        self.login()
        status, _ = self.request("POST", "/change-password", {"current": "wrong", "new": "AnotherPassphrase123!"})
        self.assertEqual(status, 403)
        status, _ = self.request("POST", "/change-password", {"current": "TestingPassphrase123!", "new": "AnotherPassphrase123!"})
        self.assertEqual(status, 200)
        self.assertEqual(self.request("GET", "/me")[0], 401)
        status, _ = self.request("POST", "/login", {"email": "operator@example.test", "password": "AnotherPassphrase123!"})
        self.assertEqual(status, 200)
        with server.db() as con:
            con.execute("UPDATE users SET password_hash=? WHERE email=?", (server.hash_password("TestingPassphrase123!"), "operator@example.test"))


if __name__ == "__main__":
    unittest.main()
