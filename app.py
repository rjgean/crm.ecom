"""WSGI entrypoint for Vercel; local development still uses server.py."""
import io
import threading
from flask import Flask, Response, request
from server import Handler, init_db, turso_credentials
import os

app = Flask(__name__)
_ready = False
_lock = threading.Lock()


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "DELETE"])
@app.route("/<path:path>", methods=["GET", "POST", "PATCH", "DELETE"])
def dispatch(path):
    global _ready
    if path.startswith("api/"):
        if not os.environ.get("SUPABASE_DB_URL") and not all(turso_credentials()):
            return {"error": "Banco de dados não configurado na hospedagem."}, 503
        if not _ready:
            with _lock:
                if not _ready:
                    try:
                        init_db()
                        _ready = True
                    except RuntimeError:
                        app.logger.exception("Falha ao inicializar o banco")
                        return {"error": "Banco indisponível. Confira as variáveis de ambiente e os registros do servidor."}, 503
                    except Exception:
                        app.logger.exception("Falha ao inicializar o banco")
                        return {"error": "Banco indisponível. Confira as variáveis de ambiente e os registros do servidor."}, 503
    handler = object.__new__(Handler)
    handler.path = request.full_path.rstrip("?")
    handler.headers = request.headers
    handler.client_address = (request.remote_addr or "unknown", 0)
    handler.rfile = io.BytesIO(request.get_data(cache=False))
    handler.wfile = io.BytesIO()
    result = {"status": 200, "headers": []}
    handler.send_response = lambda status: result.update(status=status)
    handler.send_header = lambda name, value: result["headers"].append((name, value))
    handler.end_headers = lambda: None
    try:
        handler.route(request.method)
    except Exception:
        app.logger.exception("Falha ao processar a requisição")
        return {"error": "Não foi possível concluir a operação. Confira os registros do servidor."}, 500
    return Response(handler.wfile.getvalue(), status=result["status"], headers=result["headers"])
