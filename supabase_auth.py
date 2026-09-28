"""Server-side PKCE Google sign-in through Supabase Auth."""

import base64
import hashlib
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request


def credentials():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    owner = os.environ.get("CRM_ADMIN_GOOGLE_EMAIL", "").strip().lower()
    if not (url and key and owner and "@" in owner):
        raise ValueError("Configure SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e CRM_ADMIN_GOOGLE_EMAIL")
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or not parts.hostname.endswith(".supabase.co") or parts.username or parts.password or parts.port:
        raise ValueError("SUPABASE_URL deve ser a URL HTTPS do projeto Supabase")
    return url, key, owner


def start_url(callback):
    url, _, _ = credentials()
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = secrets.token_urlsafe(32)
    query = urllib.parse.urlencode({"provider": "google", "redirect_to": callback, "code_challenge": challenge, "code_challenge_method": "s256"})
    return state, verifier, url + "/auth/v1/authorize?" + query


def fetch_json(url, *, key, token=None, payload=None):
    headers = {"apikey": key, "Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=json.dumps(payload).encode() if payload is not None else None, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.loads(response.read(100_000))


def exchange(code, verifier):
    url, key, _ = credentials()
    try:
        session = fetch_json(url + "/auth/v1/token?grant_type=pkce", key=key, payload={"auth_code": code, "code_verifier": verifier})
        user = fetch_json(url + "/auth/v1/user", key=key, token=session["access_token"])
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError) as exc:
        raise ValueError("Não foi possível confirmar o login com Google") from exc
    email = str(user.get("email") or "").strip().lower()
    providers = (user.get("app_metadata") or {}).get("providers") or []
    if not email or not user.get("email_confirmed_at") or "google" not in providers:
        raise ValueError("Entre com uma conta Google que tenha e-mail confirmado")
    return email
