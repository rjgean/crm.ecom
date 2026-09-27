"""WSGI entrypoint for Vercel; local development still uses server.py."""
import io
import os
import threading
from flask import Flask, Response, request
from server import Handler, init_db

app = Flask(__name__)
_ready = False
_lock = threading.Lock()


@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PATCH", "DELETE"])
@app.route("/<path:path>", methods=["GET", "POST", "PATCH", "DELETE"])
def dispatch(path):
    global _ready
    if path.startswith("api/"):
        if not os.environ.get("TURSO_DATABASE_URL") or not os.environ.get("TURSO_AUTH_TOKEN"):
            return {"error": "Banco de dados Turso não configurado na hospedagem."}, 503
        if not _ready:
            with _lock:
                if not _ready:
                    try:
                        init_db()
                        _ready = True
                    except RuntimeError as exc:
                        if str(exc).startswith("Defina ADMIN_EMAIL e ADMIN_PASSWORD"):
                            return {"error": "Configure ADMIN_EMAIL e ADMIN_PASSWORD (senha com pelo menos 12 caracteres) neste ambiente da Vercel."}, 503
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
