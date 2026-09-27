"""CRM comercial mínimo, sem dependências externas. Python 3.11+."""
from __future__ import annotations

import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(ROOT / "data" / "crm.sqlite3"))).resolve()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8080"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "1" if os.environ.get("VERCEL") else "0") == "1"
STAGES = ["novo", "pesquisado", "qualificado", "contato", "respondeu", "reuniao", "proposta", "negociacao", "ganho", "perdido"]
STATUSES = ["incerto", "sem_site_identificado", "apenas_redes", "site_sem_loja", "marketplace", "loja_virtual"]
STATIC = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/styles.css": ("styles.css", "text/css; charset=utf-8")}
WORKER_WAKE = threading.Event()
LOGIN_FAILURES = {}
LOGIN_LOCK = threading.Lock()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def vercel_sso_only(host=""):
    # Vercel Authentication protects this project's *.vercel.app deployments.
    # Custom domains are excluded by its current project configuration.
    return bool(os.environ.get("VERCEL") and os.environ.get("VERCEL_ENV") in ("preview", "production") and host.lower().split(":")[0].endswith(".vercel.app"))


def turso_credentials():
    """Accept direct variables or the namespaced keys provisioned by Turso."""
    url = os.environ.get("TURSO_DATABASE_URL") or os.environ.get("crmecom_TURSO_DATABASE_URL")
    token = os.environ.get("TURSO_AUTH_TOKEN") or os.environ.get("crmecom_TURSO_AUTH_TOKEN")
    return url, token


SERVICE_ENV = {"apify": "APIFY_TOKEN", "firecrawl": "FIRECRAWL_API_KEY"}


def credential_cipher():
    # The Turso token is server-only, persistent across deployments, and is never
    # stored in the database. Local installs can supply a separate long random key.
    material = os.environ.get("CRM_CREDENTIALS_KEY") or turso_credentials()[1]
    if not material or len(material) < 32:
        raise RuntimeError("Defina CRM_CREDENTIALS_KEY no servidor para salvar credenciais.")
    return AESGCM(hashlib.sha256(b"crm-ecom-credentials-v1:" + material.encode()).digest())


def service_key(service):
    if service not in SERVICE_ENV: raise ValueError("Serviço inválido")
    with db() as con:
        row = con.execute("SELECT secret FROM integrations WHERE name=?", (service,)).fetchone()
    if row:
        try:
            raw = base64.urlsafe_b64decode(row[0])
            return credential_cipher().decrypt(raw[:12], raw[12:], service.encode()).decode()
        except (InvalidTag, ValueError, RuntimeError):
            return ""
    return os.environ.get(SERVICE_ENV[service], "")


def save_service_key(service, value):
    if service not in SERVICE_ENV: raise ValueError("Serviço inválido")
    nonce = secrets.token_bytes(12)
    encrypted = base64.urlsafe_b64encode(nonce + credential_cipher().encrypt(nonce, value.encode(), service.encode())).decode()
    with db() as con:
        con.execute("INSERT INTO integrations(name,secret,updated_at) VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET secret=excluded.secret,updated_at=excluded.updated_at", (service, encrypted, now()))


def db():
    url, token = turso_credentials()
    if url:
        import turso_serverless
        if not token: raise RuntimeError("TURSO_AUTH_TOKEN ausente")
        con = turso_serverless.connect(url, auth_token=token)
        con.row_factory = turso_serverless.Row
        con.execute("PRAGMA foreign_keys=ON")
        return con
    con = sqlite3.connect(DB_PATH, timeout=20)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=20000")
    return con


def init_db():
    if not turso_credentials()[0]: DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS campaigns(id INTEGER PRIMARY KEY, niche TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, limit_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'queued', apify_run_id TEXT, dataset_id TEXT, found INTEGER NOT NULL DEFAULT 0, saved INTEGER NOT NULL DEFAULT 0, enriched INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS leads(
            id INTEGER PRIMARY KEY, external_id TEXT UNIQUE, name TEXT NOT NULL, name_key TEXT NOT NULL, category TEXT, city TEXT, state TEXT, address TEXT,
            phone TEXT, phone_digits TEXT, website TEXT, instagram TEXT, facebook TEXT, marketplace TEXT, maps_url TEXT,
            rating REAL, reviews_count INTEGER, digital_status TEXT NOT NULL DEFAULT 'incerto', score INTEGER NOT NULL DEFAULT 0,
            stage TEXT NOT NULL DEFAULT 'novo', source TEXT NOT NULL DEFAULT 'manual', campaign_id INTEGER REFERENCES campaigns(id),
            offer TEXT, amount REAL, notes TEXT, next_action_at TEXT, reviewed INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS leads_lookup ON leads(name_key, city, state);
        CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);
        CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE, kind TEXT NOT NULL, value TEXT, source_url TEXT, collected_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS activities(id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE, kind TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS lead_lists(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS list_items(list_id INTEGER NOT NULL REFERENCES lead_lists(id) ON DELETE CASCADE, lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE, PRIMARY KEY(list_id, lead_id));
        CREATE TABLE IF NOT EXISTS suppression(phone_digits TEXT PRIMARY KEY, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS integrations(name TEXT PRIMARY KEY, secret TEXT NOT NULL, updated_at TEXT NOT NULL);
        """)
        if not os.environ.get("VERCEL") and not con.execute("SELECT 1 FROM users LIMIT 1").fetchone():
            email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
            password = os.environ.get("ADMIN_PASSWORD", "")
            if not email or len(password) < 12 or "@" not in email:
                raise RuntimeError("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) para criar o primeiro operador.")
            con.execute("INSERT OR IGNORE INTO users(email,password_hash) VALUES(?,?)", (email, hash_password(password)))
        if not os.environ.get("VERCEL"):
            # A thread local retoma campanhas interrompidas em reinícios do processo.
            con.execute("UPDATE campaigns SET status='queued',updated_at=? WHERE status IN ('running','enriching')", (now(),))


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def verify_password(password, value):
    try:
        _, count, salt, expected = value.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(count))
        return hmac.compare_digest(digest, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def key(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFKD", str(value or "").lower()) if not unicodedata.combining(c)).split())


def phone_digits(value):
    digits = re.sub(r"\D", "", str(value or ""))
    if digits.startswith("55") and len(digits) in (12, 13):
        digits = digits[2:]
    return digits if len(digits) in (10, 11) else ""


def whatsapp_number(value):
    digits = phone_digits(value)
    return "55" + digits if len(digits) == 11 and digits[2] == "9" else None


def clean_url(value):
    value = str(value or "").strip()
    if not value:
        return ""
    if not re.match(r"^https?://", value, re.I):
        value = "https://" + value
    parsed = urllib.parse.urlsplit(value)
    return value[:1000] if parsed.scheme in ("http", "https") and parsed.hostname else ""


def rowdict(row):
    return dict(row) if row else None


def error_text(exc):
    # Provider responses may contain tokens or user data; never echo raw URLs/response bodies.
    if isinstance(exc, urllib.error.HTTPError):
        return f"Serviço externo respondeu HTTP {exc.code}."
    if isinstance(exc, TimeoutError):
        return "Tempo esgotado ao consultar o serviço externo."
    return "A execução falhou. Verifique as credenciais, os limites e os registros do servidor."


def request_json(url, token, payload=None, timeout=35):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=body, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "crm-ecom/0.1"}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read(5_000_000))


def score_lead(lead):
    status = lead.get("digital_status") or "incerto"
    score = {"sem_site_identificado": 65, "apenas_redes": 72, "site_sem_loja": 48, "marketplace": 55, "loja_virtual": 10, "incerto": 25}.get(status, 25)
    if whatsapp_number(lead.get("phone")): score += 14
    elif phone_digits(lead.get("phone")): score += 6
    if lead.get("instagram"): score += 5
    if (lead.get("reviews_count") or 0) >= 10: score += 5
    return min(score, 100)


def add_observation(con, lead_id, kind, value, url):
    if not value: return
    if con.execute("SELECT 1 FROM observations WHERE lead_id=? AND kind=? AND value=? AND source_url=?", (lead_id, kind, str(value), url or "")).fetchone(): return
    con.execute("INSERT INTO observations(lead_id,kind,value,source_url,collected_at) VALUES(?,?,?,?,?)", (lead_id, kind, str(value)[:1000], (url or "")[:1000], now()))


def upsert_lead(con, item, campaign_id=None, source="manual"):
    name = str(item.get("name") or item.get("title") or "").strip()[:200]
    if not name: return None, False
    city = str(item.get("city") or "").strip()[:100]
    state = str(item.get("state") or "").strip()[:30]
    raw_phone = str(item.get("phone") or "").strip()[:60]
    digits = phone_digits(raw_phone)
    if digits and con.execute("SELECT 1 FROM suppression WHERE phone_digits=?", (digits,)).fetchone(): return None, False
    ext = str(item.get("external_id") or item.get("placeId") or item.get("place_id") or "").strip()[:150] or None
    website = clean_url(item.get("website"))
    instagram = clean_url(item.get("instagram"))
    maps = clean_url(item.get("maps_url") or item.get("url"))
    existing = con.execute("SELECT * FROM leads WHERE external_id=?", (ext,)).fetchone() if ext else None
    if not existing and digits:
        existing = con.execute("SELECT * FROM leads WHERE phone_digits=? AND name_key=?", (digits, key(name))).fetchone()
    if not existing and city:
        existing = con.execute("SELECT * FROM leads WHERE name_key=? AND lower(city)=lower(?) AND lower(state)=lower(?)", (key(name), city, state)).fetchone()
    if existing:
        lead_id = existing["id"]
        # Never overwrite operator-reviewed data or pipeline state during a new campaign.
        con.execute("""UPDATE leads SET external_id=COALESCE(external_id,?),category=COALESCE(category,?),address=COALESCE(address,?),phone=COALESCE(phone,?),phone_digits=COALESCE(phone_digits,?),website=COALESCE(website,?),instagram=COALESCE(instagram,?),maps_url=COALESCE(maps_url,?),rating=COALESCE(rating,?),reviews_count=COALESCE(reviews_count,?),updated_at=? WHERE id=?""", (ext, item.get("category"), item.get("address"), raw_phone or None, digits or None, website or None, instagram or None, maps or None, item.get("rating"), item.get("reviews_count") or item.get("reviewsCount"), now(), lead_id))
        created = False
    else:
        status = "site_sem_loja" if website else "incerto"
        candidate = {"digital_status": status, "phone": raw_phone, "instagram": instagram, "reviews_count": item.get("reviews_count") or item.get("reviewsCount")}
        cur = con.execute("""INSERT INTO leads(external_id,name,name_key,category,city,state,address,phone,phone_digits,website,instagram,maps_url,rating,reviews_count,digital_status,score,source,campaign_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (ext, name, key(name), item.get("category"), city, state, item.get("address"), raw_phone or None, digits or None, website or None, instagram or None, maps or None, item.get("rating"), item.get("reviews_count") or item.get("reviewsCount"), status, score_lead(candidate), source, campaign_id, now(), now()))
        lead_id, created = cur.lastrowid, True
    add_observation(con, lead_id, "descoberta", name, maps or str(item.get("source_url") or ""))
    if website: add_observation(con, lead_id, "site informado pela fonte", website, maps)
    if instagram: add_observation(con, lead_id, "instagram informado pela fonte", instagram, maps)
    return lead_id, created


SOCIAL = ("instagram.com", "facebook.com", "fb.com", "linktr.ee", "linktree.com", "beacons.ai", "wa.me", "api.whatsapp.com")
MARKET = ("mercadolivre.com", "mercadolivre.com.br", "shopee.com", "amazon.com.br", "ifood.com.br")
DIRECTORY = ("google.com", "maps.google", "yelp.", "tripadvisor.", "solutudo.com.br", "cnpj.biz", "listaamarela.", "guiamais.com.br")
SHOP = ("nuvemshop.com.br", "lojavirtualnuvem.com.br", "yampi.com.br", "myshopify.com")


def enrich_lead(lead_id):
    token = service_key("firecrawl")
    if not token: return False
    with db() as con:
        lead = rowdict(con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone())
    if not lead or lead["blocked"] or lead["reviewed"]: return False
    query = f'"{lead["name"]}" "{lead["city"] or ""}" site instagram loja'
    response = request_json("https://api.firecrawl.dev/v2/search", token, {"query": query[:450], "limit": 6, "country": "BR"})
    if not response.get("success", True): raise ValueError("Firecrawl não concluiu a pesquisa")
    web = (response.get("data") or {}).get("web") or []
    if not isinstance(web, list): web = []
    found = {"website": lead["website"], "instagram": lead["instagram"], "facebook": lead["facebook"], "marketplace": lead["marketplace"]}
    meaningful = [word for word in key(lead["name"]).split() if len(word) > 3 and word not in ("loja", "comercio", "servicos", "estetica")]
    evidence = []
    for hit in web[:6]:
        url = clean_url(hit.get("url") or (hit.get("metadata") or {}).get("url"))
        host = (urllib.parse.urlsplit(url).hostname or "").lower()
        text = key((hit.get("title") or "") + " " + (hit.get("description") or ""))
        matched = meaningful and sum(word in text for word in meaningful) >= (2 if len(meaningful) > 2 else 1)
        if not url or not matched: continue
        if "instagram.com" in host and not found["instagram"]: found["instagram"] = url; kind = "instagram candidato"
        elif "facebook.com" in host and not found["facebook"]: found["facebook"] = url; kind = "facebook candidato"
        elif any(x in host for x in MARKET): found["marketplace"] = url; kind = "marketplace candidato"
        elif any(x in host for x in SOCIAL + DIRECTORY): kind = "perfil ou diretório candidato"
        elif not found["website"] and meaningful and all(word in key(host).replace(" ", "") for word in meaningful): found["website"] = url; kind = "site candidato"
        elif not found["website"]: kind = "resultado candidato; domínio não associado com segurança"
        else: kind = "resultado associado"
        evidence.append((kind, (hit.get("title") or url)[:200], url))
    website = found["website"] or ""
    host = (urllib.parse.urlsplit(website).hostname or "").lower()
    if website and (any(x in host for x in SHOP) or any(word in key(website) for word in ("/produto", "/products", "/collections"))): status = "loja_virtual"
    elif website: status = "site_sem_loja" # Confirmação de checkout exige revisão humana.
    elif found["marketplace"]: status = "marketplace"
    elif found["instagram"] or found["facebook"]: status = "apenas_redes"
    elif web: status = "sem_site_identificado"
    else: status = "incerto"
    candidate = {**lead, **found, "digital_status": status}
    with db() as con:
        con.execute("UPDATE leads SET website=?,instagram=?,facebook=?,marketplace=?,digital_status=?,score=?,stage=CASE WHEN stage='novo' THEN 'pesquisado' ELSE stage END,updated_at=? WHERE id=? AND reviewed=0", (found["website"], found["instagram"], found["facebook"], found["marketplace"], status, score_lead(candidate), now(), lead_id))
        for kind, value, url in evidence: add_observation(con, lead_id, kind, value, url)
        add_observation(con, lead_id, "pesquisa Firecrawl", f"{len(web)} resultados; classificação: {status}", "")
    return True


def run_campaign(c):
    token = service_key("apify")
    if not token: raise RuntimeError("APIFY_TOKEN ausente")
    with db() as con:
        con.execute("UPDATE campaigns SET status='running',error=NULL,updated_at=? WHERE id=?", (now(), c["id"]))
    run_id = c["apify_run_id"]
    dataset_id = c["dataset_id"]
    if not run_id:
        actor_input = {"searchStringsArray": [f'{c["niche"]} em {c["city"]}, {c["state"]}, Brasil'], "maxCrawledPlacesPerSearch": c["limit_count"], "language": "pt", "maxReviews": 0}
        result = request_json("https://api.apify.com/v2/actors/compass~crawler-google-places/runs", token, actor_input)
        run_id = result["data"]["id"]
        with db() as con: con.execute("UPDATE campaigns SET apify_run_id=?,updated_at=? WHERE id=?", (run_id, now(), c["id"]))
    for _ in range(150):
        run = request_json(f"https://api.apify.com/v2/actor-runs/{urllib.parse.quote(run_id)}/", token)["data"]
        if run["status"] == "SUCCEEDED":
            dataset_id = run["defaultDatasetId"]
            break
        if run["status"] in ("FAILED", "ABORTED", "TIMED-OUT"): raise RuntimeError(f"Execução Apify: {run['status']}")
        time.sleep(4)
    else: raise TimeoutError()
    with db() as con: con.execute("UPDATE campaigns SET dataset_id=?,updated_at=? WHERE id=?", (dataset_id, now(), c["id"]))
    limit = c["limit_count"]
    items = request_json(f"https://api.apify.com/v2/datasets/{urllib.parse.quote(dataset_id)}/items?format=json&limit={limit}&offset=0", token)
    if not isinstance(items, list): raise ValueError("Dataset inválido")
    saved = 0
    lead_ids = []
    with db() as con:
        for item in items[:limit]:
            item = {**item, "city": item.get("city") or c["city"], "state": item.get("state") or c["state"], "external_id": item.get("placeId") or item.get("place_id"), "maps_url": item.get("url")}
            lead_id, created = upsert_lead(con, item, c["id"], "apify_google_maps")
            if lead_id: lead_ids.append(lead_id)
            saved += bool(created)
        con.execute("UPDATE campaigns SET status='enriching',found=?,saved=?,updated_at=? WHERE id=?", (len(items), saved, now(), c["id"]))
    enriched = 0
    failures = 0
    for lead_id in dict.fromkeys(lead_ids):
        if service_key("firecrawl"):
            try: enriched += bool(enrich_lead(lead_id))
            except (OSError, ValueError, KeyError, TimeoutError, urllib.error.HTTPError): failures += 1
        with db() as con: con.execute("UPDATE campaigns SET enriched=?,updated_at=? WHERE id=?", (enriched, now(), c["id"]))
    with db() as con:
        con.execute("UPDATE campaigns SET status=?,error=?,updated_at=? WHERE id=?", ("partial" if failures or not service_key("firecrawl") else "done", f"{failures} pesquisas de enriquecimento falharam." if failures else ("Firecrawl não configurado; leads aguardam enriquecimento." if not service_key("firecrawl") else None), now(), c["id"]))


def worker():
    while True:
        try:
            with db() as con: campaign = rowdict(con.execute("SELECT * FROM campaigns WHERE status='queued' ORDER BY id LIMIT 1").fetchone())
            if not campaign:
                WORKER_WAKE.wait(3)
                WORKER_WAKE.clear()
                continue
            try: run_campaign(campaign)
            except Exception as exc:
                with db() as con: con.execute("UPDATE campaigns SET status='failed',error=?,updated_at=? WHERE id=?", (error_text(exc), now(), campaign["id"]))
        except Exception:
            time.sleep(3)


def advance_campaign(campaign_id):
    """Advance one bounded step on request; serverless instances cannot host a worker."""
    token = service_key("apify")
    if not token: raise RuntimeError("APIFY_TOKEN ausente")
    with db() as con:
        c = rowdict(con.execute("SELECT * FROM campaigns WHERE id=?", (campaign_id,)).fetchone())
    if not c: raise ApiError("Campanha não encontrada", 404)
    if c["status"] in ("done", "partial", "failed"): return c
    try:
        if c["status"] == "queued":
            with db() as con:
                claimed = con.execute("UPDATE campaigns SET status='running',updated_at=? WHERE id=? AND status='queued'", (now(), campaign_id)).rowcount
            if not claimed: return c
            actor_input = {"searchStringsArray": [f'{c["niche"]} em {c["city"]}, {c["state"]}, Brasil'], "maxCrawledPlacesPerSearch": c["limit_count"], "language": "pt", "maxReviews": 0}
            result = request_json("https://api.apify.com/v2/actors/compass~crawler-google-places/runs", token, actor_input)
            with db() as con: con.execute("UPDATE campaigns SET apify_run_id=?,updated_at=? WHERE id=?", (result["data"]["id"], now(), campaign_id))
        elif c["status"] == "running":
            if not c["apify_run_id"]: return c
            run = request_json(f'https://api.apify.com/v2/actor-runs/{urllib.parse.quote(c["apify_run_id"])}/', token)["data"]
            if run["status"] in ("FAILED", "ABORTED", "TIMED-OUT"): raise RuntimeError("Execução Apify falhou")
            if run["status"] != "SUCCEEDED": return c
            dataset_id = run["defaultDatasetId"]
            items = request_json(f'https://api.apify.com/v2/datasets/{urllib.parse.quote(dataset_id)}/items?format=json&limit={c["limit_count"]}&offset=0', token)
            if not isinstance(items, list): raise ValueError("Dataset inválido")
            saved = 0
            with db() as con:
                for item in items[:c["limit_count"]]:
                    item = {**item, "city": item.get("city") or c["city"], "state": item.get("state") or c["state"], "external_id": item.get("placeId") or item.get("place_id"), "maps_url": item.get("url")}
                    _, created = upsert_lead(con, item, campaign_id, "apify_google_maps")
                    saved += bool(created)
                con.execute("UPDATE campaigns SET status='enriching',dataset_id=?,found=?,saved=?,updated_at=? WHERE id=?", (dataset_id, len(items), saved, now(), campaign_id))
        elif c["status"] == "enriching":
            if not service_key("firecrawl"):
                with db() as con: con.execute("UPDATE campaigns SET status='partial',error=?,updated_at=? WHERE id=?", ("Firecrawl não configurado; leads aguardam enriquecimento.", now(), campaign_id))
            else:
                with db() as con:
                    lead = con.execute("SELECT id FROM leads WHERE campaign_id=? ORDER BY id LIMIT 1 OFFSET ?", (campaign_id, c["enriched"])).fetchone()
                if lead:
                    try: enrich_lead(lead[0])
                    except Exception as exc:
                        with db() as con: con.execute("UPDATE campaigns SET error=? WHERE id=?", (error_text(exc), campaign_id))
                    with db() as con: con.execute("UPDATE campaigns SET enriched=enriched+1,updated_at=? WHERE id=?", (now(), campaign_id))
                else:
                    with db() as con: con.execute("UPDATE campaigns SET status=?,updated_at=? WHERE id=?", ("partial" if c["error"] else "done", now(), campaign_id))
    except Exception as exc:
        with db() as con: con.execute("UPDATE campaigns SET status='failed',error=?,updated_at=? WHERE id=?", (error_text(exc), now(), campaign_id))
    with db() as con: return rowdict(con.execute("SELECT * FROM campaigns WHERE id=?", (campaign_id,)).fetchone())


class ApiError(Exception):
    def __init__(self, message, status=400): self.message, self.status = message, status


class Handler(BaseHTTPRequestHandler):
    server_version = "CRM/0.1"

    def log_message(self, fmt, *args):
        # Never print request paths with personal data or credentials.
        pass

    def send(self, value, status=200, content_type="application/json; charset=utf-8", headers=None):
        content = json.dumps(value, ensure_ascii=False).encode() if content_type.startswith("application/json") else value
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store" if content_type.startswith("application/json") else "public, max-age=300")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers()
        self.wfile.write(content)

    def user(self):
        if vercel_sso_only(self.headers.get("Host", "")):
            return {"email": "Acesso pela Vercel", "id": None, "csrf": "vercel-sso", "sso": True}
        cookies = dict(part.strip().split("=", 1) for part in self.headers.get("Cookie", "").split(";") if "=" in part)
        token = cookies.get("crm_session", "")
        if not token: return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        with db() as con: return rowdict(con.execute("SELECT users.email,users.id,sessions.csrf FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?", (digest, now())).fetchone())

    def json_body(self):
        size = int(self.headers.get("Content-Length", "0"))
        if size > 1_000_000: raise ApiError("Requisição muito grande", 413)
        try: return json.loads(self.rfile.read(size)) if size else {}
        except (ValueError, UnicodeDecodeError): raise ApiError("JSON inválido")

    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")
    def do_PATCH(self): self.route("PATCH")
    def do_DELETE(self): self.route("DELETE")

    def route(self, method):
        path = urllib.parse.urlsplit(self.path).path
        try:
            if method == "GET" and path in STATIC:
                name, ctype = STATIC[path]
                return self.send((ROOT / "static" / name).read_bytes(), content_type=ctype)
            if not path.startswith("/api/"): raise ApiError("Página não encontrada", 404)
            if os.environ.get("VERCEL") and not vercel_sso_only(self.headers.get("Host", "")):
                raise ApiError("Acesso disponível apenas pelo endereço protegido da Vercel.", 403)
            if method == "POST" and path == "/api/login":
                if os.environ.get("VERCEL"): raise ApiError("Use o acesso pela Vercel", 404)
                return self.login()
            user = self.user()
            if not user: raise ApiError("Entre para continuar", 401)
            if user.get("sso") and method != "GET":
                host = self.headers.get("Host", "")
                if self.headers.get("Origin") != "https://" + host:
                    raise ApiError("Origem da requisição inválida", 403)
            if method != "GET" and not hmac.compare_digest(self.headers.get("X-CSRF-Token", ""), user["csrf"]): raise ApiError("Sessão inválida; recarregue a página", 403)
            if method == "GET" and path == "/api/me": return self.send({"email": user["email"], "csrf": user["csrf"], "sso": bool(user.get("sso")), "apify": bool(service_key("apify")), "firecrawl": bool(service_key("firecrawl")), "serverless": bool(os.environ.get("VERCEL"))})
            if method == "POST" and path == "/api/integrations":
                body = self.json_body()
                service, token = str(body.get("service", "")), str(body.get("token", "")).strip()
                if service not in SERVICE_ENV or not 10 <= len(token) <= 4096: raise ApiError("Informe uma chave válida para Apify ou Firecrawl")
                try: save_service_key(service, token)
                except RuntimeError as exc: raise ApiError(str(exc), 503)
                return self.send({"configured": True})
            match = re.fullmatch(r"/api/integrations/(apify|firecrawl)", path)
            if method == "DELETE" and match:
                with db() as con: con.execute("DELETE FROM integrations WHERE name=?", (match[1],))
                return self.send({"configured": bool(os.environ.get(SERVICE_ENV[match[1]]))})
            if method == "POST" and path == "/api/logout":
                if user.get("sso"): raise ApiError("Encerre a sessão na Vercel", 404)
                cookies = dict(part.strip().split("=", 1) for part in self.headers.get("Cookie", "").split(";") if "=" in part)
                with db() as con: con.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(cookies.get("crm_session", "").encode()).hexdigest(),))
                return self.send({"ok": True}, headers={"Set-Cookie": "crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})
            if method == "POST" and path == "/api/change-password":
                if user.get("sso"): raise ApiError("A senha é gerenciada pela Vercel", 404)
                return self.change_password(user)
            if method == "GET" and path == "/api/dashboard": return self.dashboard()
            if method == "GET" and path == "/api/leads": return self.leads()
            if method == "POST" and path == "/api/leads": return self.create_lead()
            if method == "POST" and path == "/api/import": return self.import_leads()
            if method == "GET" and path == "/api/export": return self.export_leads()
            match = re.fullmatch(r"/api/leads/(\d+)", path)
            if match:
                lead_id = int(match[1])
                if method == "GET": return self.lead_detail(lead_id)
                if method == "PATCH": return self.update_lead(lead_id)
            match = re.fullmatch(r"/api/leads/(\d+)/(activity|enrich|block)", path)
            if match and method == "POST": return self.lead_action(int(match[1]), match[2])
            if method == "GET" and path == "/api/campaigns":
                with db() as con: return self.send([dict(x) for x in con.execute("SELECT * FROM campaigns ORDER BY id DESC LIMIT 100")])
            if method == "POST" and path == "/api/campaigns": return self.create_campaign()
            match = re.fullmatch(r"/api/campaigns/(\d+)/advance", path)
            if method == "POST" and match: return self.send(advance_campaign(int(match[1])))
            if method == "GET" and path == "/api/lists": return self.get_lists()
            if method == "POST" and path == "/api/lists": return self.create_list()
            match = re.fullmatch(r"/api/lists/(\d+)/items", path)
            if match and method == "POST": return self.add_list_item(int(match[1]))
            raise ApiError("Rota não encontrada", 404)
        except ApiError as exc: return self.send({"error": exc.message}, exc.status)
        except (sqlite3.Error, ValueError, TypeError, KeyError) as exc:
            return self.send({"error": "Não foi possível concluir a operação. Confira os dados e tente novamente."}, 400)

    def login(self):
        address = self.client_address[0]
        with LOGIN_LOCK:
            attempts = [t for t in LOGIN_FAILURES.get(address, []) if time.time() - t < 900]
            LOGIN_FAILURES[address] = attempts
            if len(attempts) >= 8: raise ApiError("Muitas tentativas. Tente novamente mais tarde.", 429)
        body = self.json_body()
        email = str(body.get("email", "")).strip().lower()
        password = str(body.get("password", ""))
        # Uniformly slow failure response to discourage guessing.
        with db() as con: user = rowdict(con.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone())
        if not user or not verify_password(password, user["password_hash"]):
            with LOGIN_LOCK: LOGIN_FAILURES[address].append(time.time())
            time.sleep(0.6)
            raise ApiError("E-mail ou senha inválidos", 401)
        with LOGIN_LOCK: LOGIN_FAILURES.pop(address, None)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with db() as con:
            con.execute("DELETE FROM sessions WHERE expires_at<?", (now(),))
            con.execute("INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), user["id"], csrf, (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(timespec="seconds")))
        secure = "; Secure" if COOKIE_SECURE else ""
        return self.send({"email": email, "csrf": csrf}, headers={"Set-Cookie": f"crm_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800{secure}"})

    def change_password(self, user):
        body = self.json_body()
        old, new = str(body.get("current", "")), str(body.get("new", ""))
        if len(new) < 12 or len(new) > 200: raise ApiError("A nova senha deve ter entre 12 e 200 caracteres")
        with db() as con:
            saved = con.execute("SELECT password_hash FROM users WHERE id=?", (user["id"],)).fetchone()
            if not saved or not verify_password(old, saved[0]): raise ApiError("Senha atual incorreta", 403)
            con.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(new), user["id"]))
            con.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
        return self.send({"ok": True}, headers={"Set-Cookie": "crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"})

    def dashboard(self):
        with db() as con:
            counts = {"found": con.execute("SELECT COALESCE(SUM(found),0) FROM campaigns").fetchone()[0], "saved": con.execute("SELECT COUNT(*) FROM leads WHERE blocked=0").fetchone()[0], "no_site": con.execute("SELECT COUNT(*) FROM leads WHERE digital_status IN ('sem_site_identificado','apenas_redes') AND blocked=0").fetchone()[0], "contacted": con.execute("SELECT COUNT(DISTINCT lead_id) FROM activities WHERE kind IN ('whatsapp_aberto','ligacao')").fetchone()[0], "proposals": con.execute("SELECT COUNT(*) FROM leads WHERE stage IN ('proposta','negociacao','ganho')").fetchone()[0], "customers": con.execute("SELECT COUNT(*) FROM leads WHERE stage='ganho'").fetchone()[0], "avg_score": round(con.execute("SELECT COALESCE(AVG(score),0) FROM leads WHERE blocked=0").fetchone()[0], 1)}
            recent = [dict(x) for x in con.execute("SELECT id,name,city,state,digital_status,score,stage FROM leads WHERE blocked=0 ORDER BY updated_at DESC,id DESC LIMIT 5")]
            activity = [dict(x) for x in con.execute("SELECT a.*,l.name FROM activities a LEFT JOIN leads l ON l.id=a.lead_id ORDER BY a.id DESC LIMIT 8")]
            stages = [dict(x) for x in con.execute("SELECT stage,COUNT(*) count FROM leads WHERE blocked=0 GROUP BY stage")]
            niches = [dict(x) for x in con.execute("SELECT category,COUNT(*) count FROM leads WHERE blocked=0 AND category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 12")]
            return self.send({"metrics": counts, "recent": recent, "activity": activity, "stages": stages, "niches": niches})

    def leads(self):
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        clauses = ["blocked=0"]
        params = []
        if q.get("q"):
            clauses.append("(name LIKE ? OR city LIKE ? OR category LIKE ?)")
            params.extend(["%" + q["q"][0][:100] + "%"] * 3)
        for field in ("stage", "digital_status", "city", "category"):
            if q.get(field) and q[field][0]: clauses.append(f"{field}=?"); params.append(q[field][0][:100])
        if q.get("list_id") and q["list_id"][0].isdigit():
            clauses.append("id IN (SELECT lead_id FROM list_items WHERE list_id=?)")
            params.append(int(q["list_id"][0]))
        where = " AND ".join(clauses)
        with db() as con:
            total = con.execute("SELECT COUNT(*) FROM leads WHERE " + where, params).fetchone()[0]
            rows = [dict(x) for x in con.execute("SELECT * FROM leads WHERE " + where + " ORDER BY score DESC, id DESC LIMIT 300", params)]
        for x in rows: x["whatsapp"] = whatsapp_number(x["phone"])
        return self.send({"items": rows, "total": total})

    def lead_detail(self, lead_id):
        with db() as con:
            lead = rowdict(con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone())
            if not lead: raise ApiError("Lead não encontrado", 404)
            lead["whatsapp"] = whatsapp_number(lead["phone"])
            lead["observations"] = [dict(x) for x in con.execute("SELECT * FROM observations WHERE lead_id=? ORDER BY id DESC", (lead_id,))]
            lead["activities"] = [dict(x) for x in con.execute("SELECT * FROM activities WHERE lead_id=? ORDER BY id DESC", (lead_id,))]
            lead["lists"] = [x[0] for x in con.execute("SELECT list_id FROM list_items WHERE lead_id=?", (lead_id,))]
            return self.send(lead)

    def create_lead(self):
        body = self.json_body()
        if not str(body.get("name", "")).strip(): raise ApiError("Informe o nome da empresa")
        with db() as con: lead_id, created = upsert_lead(con, body)
        if not lead_id: raise ApiError("Contato bloqueado ou dados insuficientes")
        return self.send({"id": lead_id, "created": created}, 201 if created else 200)

    def import_leads(self):
        body = self.json_body()
        content = body.get("csv", "")
        if not isinstance(content, str) or not content.strip(): raise ApiError("Envie o conteúdo CSV")
        reader = csv.DictReader(io.StringIO(content))
        if not reader.fieldnames or "name" not in reader.fieldnames: raise ApiError("CSV precisa da coluna name; opcionais: city,state,phone,category,website,instagram")
        created = 0
        with db() as con:
            for index, item in enumerate(reader):
                if index >= 500: break
                _, is_new = upsert_lead(con, item, source="csv")
                created += bool(is_new)
        return self.send({"created": created, "processed": min(index + 1, 500) if "index" in locals() else 0})

    def export_leads(self):
        with db() as con: rows = [dict(x) for x in con.execute("SELECT name,category,city,state,phone,website,instagram,digital_status,score,stage,offer,amount,source,updated_at FROM leads WHERE blocked=0 ORDER BY id DESC")]
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["name", "category", "city", "state", "phone", "website", "instagram", "digital_status", "score", "stage", "offer", "amount", "source", "updated_at"])
        writer.writeheader()
        for row in rows:
            # Avoid CSV formula injection in spreadsheet tools.
            writer.writerow({k: ("'" + str(v) if isinstance(v, str) and v.lstrip().startswith(("=", "+", "-", "@")) else v) for k, v in row.items()})
        content = ("\ufeff" + output.getvalue()).encode("utf-8")
        return self.send(content, content_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="crm-leads.csv"', "Cache-Control": "no-store"})

    def update_lead(self, lead_id):
        body = self.json_body()
        fields = {"name", "category", "city", "state", "address", "phone", "website", "instagram", "facebook", "marketplace", "stage", "digital_status", "offer", "amount", "notes", "next_action_at", "reviewed"}
        values = {k: v for k, v in body.items() if k in fields}
        if not values: raise ApiError("Nenhuma alteração informada")
        if values.get("stage") and values["stage"] not in STAGES: raise ApiError("Etapa inválida")
        if values.get("digital_status") and values["digital_status"] not in STATUSES: raise ApiError("Classificação inválida")
        for field in ("website", "instagram", "facebook", "marketplace"):
            if field in values: values[field] = clean_url(values[field]) or None
        if "phone" in values: values["phone_digits"] = phone_digits(values["phone"])
        if "name" in values: values["name_key"] = key(values["name"])
        if "reviewed" in values: values["reviewed"] = int(bool(values["reviewed"]))
        if "amount" in values:
            try: values["amount"] = float(values["amount"]) if values["amount"] not in (None, "") else None
            except (ValueError, TypeError): raise ApiError("Valor inválido")
            if values["amount"] is not None and not 0 <= values["amount"] <= 1_000_000: raise ApiError("Valor fora do intervalo")
        with db() as con:
            old = rowdict(con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone())
            if not old: raise ApiError("Lead não encontrado", 404)
            if "digital_status" in values and values["digital_status"] != old["digital_status"]: values["reviewed"] = 1
            if "digital_status" in values or "phone" in values or "instagram" in values:
                values["score"] = score_lead({**old, **values})
            values["updated_at"] = now()
            con.execute("UPDATE leads SET " + ",".join(f"{k}=?" for k in values) + " WHERE id=?", [*values.values(), lead_id])
            if "stage" in values and values["stage"] != old["stage"]:
                con.execute("INSERT INTO activities(lead_id,kind,detail,created_at) VALUES(?,?,?,?)", (lead_id, "etapa", f"{old['stage']} → {values['stage']}", now()))
            if "digital_status" in values and values["digital_status"] != old["digital_status"]: add_observation(con, lead_id, "revisão do operador", values["digital_status"], "")
        return self.lead_detail(lead_id)

    def lead_action(self, lead_id, action):
        body = self.json_body()
        with db() as con:
            lead = rowdict(con.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone())
            if not lead: raise ApiError("Lead não encontrado", 404)
            if action == "block":
                if lead["phone_digits"]: con.execute("INSERT OR IGNORE INTO suppression(phone_digits,created_at) VALUES(?,?)", (lead["phone_digits"], now()))
                con.execute("UPDATE leads SET blocked=1,updated_at=? WHERE id=?", (now(), lead_id))
                con.execute("INSERT INTO activities(lead_id,kind,detail,created_at) VALUES(?,?,?,?)", (lead_id, "bloqueio", "Contato bloqueado para novas abordagens", now()))
            elif action == "enrich":
                if not service_key("firecrawl"): raise ApiError("Configure FIRECRAWL_API_KEY no servidor")
                # Enrichment can take seconds; only this explicit single-lead action blocks a request.
            elif action == "activity":
                kind = str(body.get("kind") or "nota")[:40]
                if kind not in ("nota", "ligacao", "whatsapp_aberto", "resposta", "reuniao", "proposta", "tarefa"): raise ApiError("Atividade inválida")
                detail = str(body.get("detail") or "").strip()[:1500]
                if not detail: raise ApiError("Descreva a atividade")
                con.execute("INSERT INTO activities(lead_id,kind,detail,created_at) VALUES(?,?,?,?)", (lead_id, kind, detail, now()))
                con.execute("UPDATE leads SET updated_at=? WHERE id=?", (now(), lead_id))
        if action == "enrich":
            try: enrich_lead(lead_id)
            except Exception as exc: raise ApiError(error_text(exc), 502)
        return self.lead_detail(lead_id)

    def create_campaign(self):
        body = self.json_body()
        niche, city, state = (str(body.get(k, "")).strip() for k in ("niche", "city", "state"))
        if not niche or not city or not state or any(len(x) > 100 for x in (niche, city, state)): raise ApiError("Informe segmento, cidade e UF")
        if not service_key("apify"): raise ApiError("Configure APIFY_TOKEN no servidor antes de iniciar a busca")
        try: limit = int(body.get("limit", 20))
        except (ValueError, TypeError): raise ApiError("Limite inválido")
        if not 1 <= limit <= 100: raise ApiError("Use um limite de 1 a 100 empresas")
        with db() as con: cur = con.execute("INSERT INTO campaigns(niche,city,state,limit_count,created_at,updated_at) VALUES(?,?,?,?,?,?)", (niche, city, state.upper()[:2], limit, now(), now()))
        if not os.environ.get("VERCEL"): WORKER_WAKE.set()
        return self.send({"id": cur.lastrowid, "status": "queued"}, 201)

    def get_lists(self):
        with db() as con: return self.send([dict(x) for x in con.execute("SELECT l.id,l.name,COUNT(i.lead_id) count FROM lead_lists l LEFT JOIN list_items i ON l.id=i.list_id GROUP BY l.id ORDER BY l.id DESC")])

    def create_list(self):
        name = str(self.json_body().get("name") or "").strip()[:100]
        if not name: raise ApiError("Informe o nome da lista")
        try:
            with db() as con: cur = con.execute("INSERT INTO lead_lists(name,created_at) VALUES(?,?)", (name, now()))
        except sqlite3.IntegrityError: raise ApiError("Já existe uma lista com esse nome")
        return self.send({"id": cur.lastrowid, "name": name}, 201)

    def add_list_item(self, list_id):
        lead_id = int(self.json_body().get("lead_id", 0))
        try:
            with db() as con: con.execute("INSERT OR IGNORE INTO list_items(list_id,lead_id) VALUES(?,?)", (list_id, lead_id))
        except sqlite3.IntegrityError: raise ApiError("Lista ou lead não encontrado", 404)
        return self.send({"ok": True})


def main():
    init_db()
    threading.Thread(target=worker, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"CRM pronto em http://{HOST}:{PORT} (banco: {DB_PATH})", flush=True)
    server.serve_forever()


if __name__ == "__main__": main()
