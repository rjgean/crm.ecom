import http.cookiejar
import json
import os
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
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
        headers["Origin"] = self.base
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

    def test_login_rejects_non_object_json_without_server_error(self):
        status, value = self.request("POST", "/login", ["operator@example.test", "TestingPassphrase123!"])
        self.assertEqual(status, 400)
        self.assertIn("objeto JSON", value["error"])

    def test_leads_can_be_filtered_by_campaign(self):
        self.login()
        _, first = self.request("POST", "/leads", {"name":"Campanha Loja A", "category":"Moda", "city":"Niterói", "state":"RJ"})
        _, second = self.request("POST", "/leads", {"name":"Lead fora da campanha", "category":"Moda", "city":"Niterói", "state":"RJ"})
        with server.db() as con:
            campaign_id = con.execute("INSERT INTO campaigns(niche,city,state,limit_count,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)", ("Moda feminina", "Niterói", "RJ", 20, "done", server.now(), server.now())).lastrowid
            con.execute("UPDATE leads SET campaign_id=? WHERE id=?", (campaign_id, first["id"]))
        status, result = self.request("GET", f"/leads?campaign_id={campaign_id}")
        self.assertEqual(status, 200)
        self.assertEqual([lead["id"] for lead in result["items"]], [first["id"]])
        self.assertNotIn(second["id"], [lead["id"] for lead in result["items"]])

    def test_custom_niche_library_supports_create_edit_delete(self):
        self.login()
        status, created = self.request("POST", "/niches", {"name":"Clínicas de harmonização", "category":"Saúde e bem-estar"})
        self.assertEqual(status, 201)
        niche_id = created["id"]
        self.assertEqual(self.request("POST", "/niches", {"name":"clínicas de HARMONIZAÇÃO", "category":"Outro grupo"})[0], 409)
        status, rows = self.request("GET", "/niches")
        self.assertEqual(status, 200)
        self.assertTrue(any(row["id"] == niche_id for row in rows))
        status, updated = self.request("PATCH", f"/niches/{niche_id}", {"name":"Harmonização facial", "category":"Serviços locais"})
        self.assertEqual(status, 200)
        self.assertEqual((updated["name"], updated["category"]), ("Harmonização facial", "Serviços locais"))
        self.assertEqual(self.request("DELETE", f"/niches/{niche_id}")[0], 200)
        self.assertEqual(self.request("DELETE", f"/niches/{niche_id}")[0], 404)

    def test_objection_scripts_are_saved_per_stage_and_type(self):
        self.login()
        status, defaults = self.request("GET", "/sales-scripts")
        self.assertEqual(status, 200)
        self.assertGreaterEqual(len(defaults), len(server.STAGES) * len(server.OBJECTION_TYPES))
        edited = "Agradeço por explicar. Vamos olhar juntos o escopo e decidir sem pressão."
        status, saved = self.request("POST", "/sales-scripts", {"stage":"proposta", "objection_key":"price", "body":edited})
        self.assertEqual(status, 200)
        self.assertEqual(saved["body"], edited)
        _, rows = self.request("GET", "/sales-scripts")
        self.assertEqual(next(x for x in rows if x["stage"]=="proposta" and x["objection_key"]=="price")["body"], edited)
        self.assertNotEqual(next(x for x in rows if x["stage"]=="contato" and x["objection_key"]=="price")["body"], edited)
        self.assertEqual(self.request("POST", "/sales-scripts", {"stage":"bogus", "objection_key":"price", "body":edited})[0], 400)

    def test_appointments_can_be_created_edited_listed_and_deleted(self):
        self.login()
        _, lead = self.request("POST", "/leads", {"name":"Agenda Teste", "city":"Niterói", "state":"RJ"})
        meeting = {"lead_id":lead["id"], "title":"Apresentação da proposta", "starts_at":"2026-10-14T14:30:00-03:00", "duration_minutes":45, "meet_url":"https://meet.google.com/abc-defg-hij", "notes":"Revisar catálogo e prazos"}
        status, created = self.request("POST", "/appointments", meeting)
        self.assertEqual(status, 201)
        self.assertEqual(created["lead_id"], lead["id"])
        self.assertEqual(created["meet_url"], meeting["meet_url"])
        status, rows = self.request("GET", "/appointments?start=2026-10-14&end=2026-10-14")
        self.assertEqual(status, 200)
        self.assertTrue(any(row["id"]==created["id"] and row["lead_name"]=="Agenda Teste" for row in rows))
        status, updated = self.request("PATCH", f"/appointments/{created['id']}", {"title":"Reunião confirmada", "status":"completed"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["title"], "Reunião confirmada")
        self.assertEqual(updated["status"], "completed")
        self.assertEqual(self.request("PATCH", f"/appointments/{created['id']}", {"meet_url":"javascript:alert(1)"})[0], 400)
        self.assertEqual(self.request("DELETE", f"/appointments/{created['id']}")[0], 200)
        self.assertEqual(self.request("DELETE", f"/appointments/{created['id']}")[0], 404)

    def test_crm_quick_filters_search_tiers_site_and_phone(self):
        self.login()
        leads=[]
        for name,phone in (("Lead Nicho Quente","21987654321"),("Lead Nicho Morno",""),("Lead Nicho sem site","")):
            _, lead=self.request("POST","/leads",{"name":name,"category":"Serviço segmentado","city":"Rio","phone":phone})
            leads.append(lead["id"])
        with server.db() as con:
            con.execute("UPDATE leads SET score=80,digital_status='sem_site_identificado' WHERE id=?",(leads[0],))
            con.execute("UPDATE leads SET score=55,digital_status='site_sem_loja' WHERE id=?",(leads[1],))
            con.execute("UPDATE leads SET score=30,digital_status='apenas_redes' WHERE id=?",(leads[2],))
        _, tier3=self.request("GET","/leads?tier=3")
        self.assertIn(leads[0],[lead["id"] for lead in tier3["items"]])
        _, tier2=self.request("GET","/leads?tier=2")
        self.assertIn(leads[1],[lead["id"] for lead in tier2["items"]])
        _, no_site=self.request("GET","/leads?no_site=1")
        self.assertEqual({lead["id"] for lead in no_site["items"]}&set(leads),{leads[0],leads[2]})
        _, with_phone=self.request("GET","/leads?with_phone=1")
        self.assertIn(leads[0],[lead["id"] for lead in with_phone["items"]])
        _, by_category=self.request("GET","/leads?q=segmentado")
        self.assertIn(leads[0],[lead["id"] for lead in by_category["items"]])
        _, usage=self.request("GET","/usage")
        self.assertGreaterEqual(usage["leads_this_month"],3)
        self.assertEqual(usage["monthly_goal"],40)

    def test_supabase_database_url_can_back_integration_encryption(self):
        env = {
            "CRM_CREDENTIALS_KEY": "",
            "TURSO_AUTH_TOKEN": "",
            "crmecom_TURSO_AUTH_TOKEN": "",
            "SUPABASE_DB_URL": "postgresql://private-user:private-password@db.example.supabase.co/postgres",
        }
        with patch.dict(os.environ, env):
            cipher = server.credential_cipher()
            nonce = b"0123456789ab"
            encrypted = cipher.encrypt(nonce, b"test-secret", b"apify")
            self.assertEqual(cipher.decrypt(nonce, encrypted, b"apify"), b"test-secret")

    def test_existing_database_migrates_first_user_to_admin(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "legacy.sqlite3"
            with sqlite3.connect(path) as con:
                con.execute("CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)")
                con.execute("INSERT INTO users(email,password_hash) VALUES(?,?)", ("legacy-admin@example.test", server.hash_password("LegacyPassword123!")))
            with patch.object(server, "DB_PATH", path):
                server.init_db()
                with server.db() as con:
                    user = con.execute("SELECT email,role FROM users").fetchone()
                self.assertEqual(tuple(user), ("legacy-admin@example.test", "admin"))

    def test_admin_can_create_collaborator_and_collaborator_can_only_manage_own_password(self):
        self.login()
        email = "daily.collaborator@example.test"
        password = "InitialCollaboratorPass123!"
        status, created = self.request("POST", "/access/collaborators", {"email": email, "password": password})
        self.assertEqual(status, 201)
        self.assertTrue(created["id"])
        self.assertNotIn("password", created)
        status, users = self.request("GET", "/access/collaborators")
        self.assertEqual(status, 200)
        self.assertTrue(any(user["email"] == email for user in users))
        self.assertEqual(self.request("POST", "/access/collaborators", {"email": email, "password": password})[0], 409)
        self.assertEqual(self.request("POST", "/logout")[0], 200)
        self.csrf = ""

        status, login = self.request("POST", "/login", {"email": email, "password": password})
        self.assertEqual(status, 200)
        self.csrf = login["csrf"]
        _, profile = self.request("GET", "/me")
        self.assertEqual(profile["role"], "collaborator")
        self.assertEqual(self.request("GET", "/dashboard")[0], 200)
        self.assertEqual(self.request("GET", "/access/collaborators")[0], 403)
        self.assertEqual(self.request("POST", "/integrations", {"service": "apify", "token": "test-api-key-value"})[0], 403)
        self.assertEqual(self.request("POST", "/change-password", {"current": "wrong", "new": "NewCollaboratorPass456!"})[0], 403)
        self.assertEqual(self.request("POST", "/change-password", {"current": password, "new": "NewCollaboratorPass456!"})[0], 200)
        self.assertEqual(self.request("GET", "/me")[0], 401)
        self.csrf = ""
        self.assertEqual(self.request("POST", "/login", {"email": email, "password": password})[0], 401)
        status, login = self.request("POST", "/login", {"email": email, "password": "NewCollaboratorPass456!"})
        self.assertEqual(status, 200)
        self.csrf = login["csrf"]
        self.assertEqual(self.request("POST", "/logout")[0], 200)
        self.csrf = ""

        self.login()
        self.assertEqual(self.request("DELETE", f"/access/collaborators/{created['id']}")[0], 200)
        self.assertEqual(self.request("POST", "/login", {"email": email, "password": "NewCollaboratorPass456!"})[0], 401)

    def test_local_diagnostics_manual_grid_and_dynamic_review_qr(self):
        self.login()
        company = {"name":"Ateliê Sol de Outubro", "category":"Loja de roupas", "city":"Niterói", "state":"RJ", "rating":4.5, "reviews_count":27}
        _, first = self.request("POST", "/leads", company)
        _, second = self.request("POST", "/leads", {**company, "name":"Ateliê Lua de Outubro", "rating":4.9, "reviews_count":8})
        lead_id = first["id"]
        _, info = self.request("GET", f"/leads/{lead_id}/local")
        self.assertEqual(info["lead"]["name"], company["name"])
        self.assertIn(second["id"], [p["id"] for p in info["peers"]])
        self.assertEqual(self.request("POST", f"/leads/{lead_id}/local", {"query":"roupas", "cells":[1]*8})[0], 400)
        self.assertEqual(self.request("POST", f"/leads/{lead_id}/local", {"query":"roupas", "cells":[1]*9}, with_csrf=False)[0], 403)
        status, result = self.request("POST", f"/leads/{lead_id}/local", {"query":"roupas femininas", "cells":[1,2,None,4,5,6,7,8,9]})
        self.assertEqual(status, 200)
        self.assertEqual(result["grid"]["cells"][2], None)
        self.assertEqual(self.request("POST", f"/leads/{lead_id}/review-qr", {"destination":"https://evil.example/"})[0], 400)
        _, qr = self.request("POST", f"/leads/{lead_id}/review-qr", {"destination":"https://g.page/r/Example/review"})
        token = qr["token"]
        _, updated = self.request("POST", f"/leads/{lead_id}/review-qr", {"destination":"https://www.google.com/maps/place/Example"})
        self.assertEqual(token, updated["token"])
        image = self.opener.open(self.base + f"/api/leads/{lead_id}/review-qr.svg")
        self.assertIn(b"<svg", image.read())
        class StopRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, request, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(StopRedirect)
        with self.assertRaises(urllib.error.HTTPError) as redirected:
            opener.open(self.base + "/r/" + token)
        self.assertEqual(redirected.exception.code, 303)
        self.assertEqual(redirected.exception.headers["Location"], "https://www.google.com/maps/place/Example")
        _, qr = self.request("GET", f"/leads/{lead_id}/review-qr")
        self.assertEqual(qr["scans"], 1)

    def test_apify_local_profile_and_real_grid_jobs(self):
        self.login()
        _, lead = self.request("POST", "/leads", {"name":"Café Lua Azul", "city":"Niterói", "state":"RJ", "category":"Café"})
        lead_id = lead["id"]
        with patch.dict(os.environ,{"APIFY_TOKEN":"only-for-tests"}):
            status, _ = self.request("POST",f"/leads/{lead_id}/local/profile/run",{})
            self.assertEqual(status,200)
            def profile_provider(url,token,payload=None,timeout=35):
                if url.endswith("/runs"):
                    self.assertTrue(payload["scrapePlaceDetailPage"])
                    self.assertEqual(payload["maxReviews"],10)
                    return {"data":{"id":"profile-test-run"}}
                if "actor-runs" in url:return {"data":{"status":"SUCCEEDED","defaultDatasetId":"profile-dataset"}}
                return [{"title":"Café Lua Azul","totalScore":4.6,"reviewsCount":27,"reviews":[{"responseFromOwnerText":"Obrigado!"},{}],"images":["x","y"],"ownerUpdates":[]}]
            with patch.object(server,"request_json",side_effect=profile_provider):
                self.request("POST",f"/leads/{lead_id}/local/profile/advance",{})
                status,result=self.request("POST",f"/leads/{lead_id}/local/profile/advance",{})
            self.assertEqual(status,200)
            self.assertEqual(result["profile"]["answered_sample"],1)
            self.assertEqual(result["lead"]["rating"],4.6)
            status,_=self.request("POST",f"/leads/{lead_id}/local/grid/run",{"term":"café"})
            self.assertEqual(status,200)
            def grid_provider(url,token,payload=None,timeout=35):
                if url.endswith("/runs"):
                    self.assertEqual(payload["gridSize"],3)
                    return {"data":{"id":"grid-test-run"}}
                if "actor-runs" in url:return {"data":{"status":"SUCCEEDED","defaultDatasetId":"grid-dataset"}}
                return [{"recordType":"point","keyword":"café","row":i//3,"col":i%3,"rank":i+1,"lat":-22.9,"lng":-43.1} for i in range(9)]+[{"recordType":"summary","keyword":"café","arp":5,"solv":62,"found":9,"total":9}]
            with patch.object(server,"request_json",side_effect=grid_provider):
                self.request("POST",f"/leads/{lead_id}/local/grid/advance",{})
                status,result=self.request("POST",f"/leads/{lead_id}/local/grid/advance",{})
            self.assertEqual(status,200)
            self.assertEqual(result["grid"]["cells"],list(range(1,10)))
            self.assertEqual(result["grid"]["solv"],62)

    def test_proposal_and_contract_are_saved_with_pdf(self):
        self.login()
        _, lead=self.request("POST","/leads",{"name":"Loja Horizonte Sete","city":"Niterói","state":"RJ"})
        lead_id=lead["id"]
        path=f"/leads/{lead_id}/local-document/proposal"
        self.assertEqual(self.request("POST",path,{"body":"Curto"})[0],400)
        self.assertEqual(self.request("POST",path,{"body":"Proposta de site institucional. Valor R$ 1.500,00 e prazo de 30 dias para aprovação."},with_csrf=False)[0],403)
        status,document=self.request("POST",path,{"body":"Proposta de site institucional. Valor R$ 1.500,00 e prazo de 30 dias para aprovação."})
        self.assertEqual(status,200)
        self.assertIn("R$ 1.500",document["body"])
        _,lead_detail=self.request("GET",f"/leads/{lead_id}")
        self.assertEqual(lead_detail["stage"],"proposta")
        response=self.opener.open(self.base+"/api"+path+".pdf")
        self.assertEqual(response.headers["Content-Type"],"application/pdf")
        self.assertTrue(response.read().startswith(b"%PDF"))
        contract="Dados para contrato: empresa Loja Horizonte Sete; serviços, preço, entregas e prazo a serem aprovados pelas partes."
        self.assertEqual(self.request("POST",f"/leads/{lead_id}/local-document/contract",{"body":contract})[0],200)

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

    def test_email_change_requires_password_and_expires_sessions(self):
        self.login()
        path = "/change-email"
        self.assertEqual(self.request("POST", path, {"email":"new@example.test","current":"TestingPassphrase123!"}, with_csrf=False)[0], 403)
        self.assertEqual(self.request("POST", path, {"email":"new@example.test","current":"wrong"})[0], 403)
        self.assertEqual(self.request("POST", path, {"email":"not-an-email","current":"TestingPassphrase123!"})[0], 400)
        self.assertEqual(self.request("POST", path, {"email":"NEW@example.test","current":"TestingPassphrase123!"})[0], 200)
        self.assertEqual(self.request("GET", "/me")[0], 401)
        self.assertEqual(self.request("POST", "/login", {"email":"operator@example.test","password":"TestingPassphrase123!"})[0], 401)
        status, session = self.request("POST", "/login", {"email":"new@example.test","password":"TestingPassphrase123!"})
        self.assertEqual(status, 200)
        self.csrf = session["csrf"]
        self.assertEqual(self.request("POST", path, {"email":"operator@example.test","current":"TestingPassphrase123!"})[0], 200)

    def test_local_radar_filters_saved_businesses(self):
        self.login()
        self.request("POST", "/leads", {"name":"Radar Céu Teste","category":"Cerâmica de teste","city":"Niterói","state":"RJ","rating":4.8,"reviews_count":6})
        self.request("POST", "/leads", {"name":"Radar Mar Teste","category":"Cerâmica de teste","city":"Niterói","state":"RJ","rating":3.8,"reviews_count":100})
        status, result = self.request("GET", "/local/radar?city=Niter%C3%B3i&niche=Cer%C3%A2mica%20de%20teste&state=RJ&min_rating=4.5&max_reviews=10")
        self.assertEqual(status, 200)
        self.assertEqual([row["name"] for row in result["items"]], ["Radar Céu Teste"])
        self.assertEqual(self.request("GET", "/local/radar?min_rating=9")[0], 400)
        self.assertEqual(self.request("GET", "/local/radar?min_rating=NaN")[0], 400)


if __name__ == "__main__":
    unittest.main()
