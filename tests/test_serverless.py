"""Exercise request-driven campaigns without a persistent background worker."""
import os
import tempfile
import tomllib
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("ADMIN_EMAIL", "operator@example.test")
os.environ.setdefault("ADMIN_PASSWORD", "TestingPassphrase123!")
import server


class ServerlessCampaignTests(unittest.TestCase):
    def test_vercel_runtime_dependencies_include_every_requirements_package(self):
        root = Path(__file__).resolve().parents[1]
        pyproject = tomllib.loads((root / "pyproject.toml").read_text())
        declared = {item.split("==", 1)[0].lower() for item in pyproject["project"]["dependencies"]}
        requirements = {line.split("==", 1)[0].lower() for line in (root / "requirements.txt").read_text().splitlines() if line.strip()}
        self.assertFalse(requirements - declared, f"Vercel dependencies missing from pyproject.toml: {requirements - declared}")

    def test_turso_marketplace_prefixed_credentials(self):
        with patch.dict(os.environ, {
            "crmecom_TURSO_DATABASE_URL": "libsql://example.turso.io",
            "crmecom_TURSO_AUTH_TOKEN": "marketplace-token",
        }, clear=True):
            self.assertEqual(server.turso_credentials(), ("libsql://example.turso.io", "marketplace-token"))

    def test_campaign_advances_one_remote_step_per_request(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "DB_PATH", Path(directory) / "crm.sqlite3"), patch.dict(os.environ, {"VERCEL": "1", "APIFY_TOKEN": "fake", "FIRECRAWL_API_KEY": "fake"}):
            server.init_db()
            with server.db() as con:
                campaign_id = con.execute("INSERT INTO campaigns(niche,city,state,limit_count,created_at,updated_at) VALUES(?,?,?,?,?,?)", ("padaria", "Rio", "RJ", 1, server.now(), server.now())).lastrowid

            def provider(url, token, payload=None, timeout=35):
                if url.endswith("/runs"): return {"data": {"id": "run-1"}}
                if "/actor-runs/" in url: return {"data": {"status": "SUCCEEDED", "defaultDatasetId": "dataset-1"}}
                if "/datasets/" in url: return [{"title": "Padaria Exemplo", "placeId": "place-1", "phone": "21999999999"}]
                if "/search" in url: return {"success": True, "data": {"web": []}}
                raise AssertionError(url)

            with patch.object(server, "request_json", side_effect=provider) as call:
                steps = [server.advance_campaign(campaign_id) for _ in range(4)]
            self.assertEqual(call.call_args_list[0].args[2], {
                "searchStringsArray": ["padaria"],
                "locationQuery": "Rio, RJ, Brasil",
                "maxCrawledPlacesPerSearch": 1,
                "language": "pt-BR",
                "maxReviews": 0,
            })
            self.assertEqual([step["status"] for step in steps], ["running", "enriching", "enriching", "done"])
            self.assertEqual((steps[-1]["found"], steps[-1]["saved"], steps[-1]["enriched"]), (1, 1, 1))

    def test_campaign_location_includes_optional_district(self):
        request=server.apify_actor_input({"niche":"Moda feminina","city":"São Gonçalo","district":"Alcântara","state":"RJ","limit_count":12})
        self.assertEqual(request["locationQuery"],"São Gonçalo, Alcântara, RJ, Brasil")
        self.assertEqual(request["maxCrawledPlacesPerSearch"],12)


if __name__ == "__main__":
    unittest.main()
