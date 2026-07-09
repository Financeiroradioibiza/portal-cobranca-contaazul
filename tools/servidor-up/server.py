#!/usr/bin/env python3
"""
Radio Ibiza — Servidor UP (agente local)
=========================================
Scan de pastas legado, ffprobe e staging de MP3 no SEU computador.
O portal (HTTPS) fala com https://127.0.0.1:8766

Uso rápido:
  Mac: duplo clique Iniciar-ServidorUP.command
  Windows: Iniciar-ServidorUP.bat
  Terminal: ./start.sh
"""

from __future__ import annotations

import json
import os
import re
import ssl
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

os.environ["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")

from scanner import ffprobe_available, list_mp3_paths, scan_inventory

PORT = 8766
VERSION = "1.0.0"
CERT_DIR = Path(__file__).resolve().parent / "certs"
CERT_FILE = CERT_DIR / "localhost.pem"
KEY_FILE = CERT_DIR / "localhost-key.pem"
STAGING_DIR = Path.home() / "Downloads" / "RadioIbiza-servidor-up"
STAGING_DIR.mkdir(parents=True, exist_ok=True)

config: dict[str, Any] = {"rootPath": ""}
config_lock = threading.Lock()


def ensure_certs() -> bool:
    if CERT_FILE.exists() and KEY_FILE.exists():
        return True
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-keyout",
                str(KEY_FILE),
                "-out",
                str(CERT_FILE),
                "-days",
                "8250",
                "-nodes",
                "-subj",
                "/CN=127.0.0.1",
            ],
            check=True,
            capture_output=True,
        )
        return CERT_FILE.exists() and KEY_FILE.exists()
    except (OSError, subprocess.CalledProcessError):
        return False


def resolve_root(body: dict[str, Any]) -> Path:
    with config_lock:
        stored = str(config.get("rootPath") or "").strip()
    raw = str(body.get("rootPath") or stored or "").strip()
    if not raw:
        raise ValueError("rootPath_obrigatorio")
    return Path(raw).expanduser()


class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            with config_lock:
                root = str(config.get("rootPath") or "")
            self._json(
                200,
                {
                    "ok": True,
                    "version": VERSION,
                    "capabilities": ["scan", "ffprobe", "inventory", "paths"],
                    "ffprobe": ffprobe_available(),
                    "rootPath": root,
                    "stagingDir": str(STAGING_DIR),
                },
            )
            return

        if self.path == "/config":
            with config_lock:
                self._json(200, {"ok": True, "rootPath": str(config.get("rootPath") or "")})
            return

        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path == "/config":
            body = self._read_json()
            root = str(body.get("rootPath") or "").strip()
            if not root:
                self._json(400, {"error": "rootPath_obrigatorio"})
                return
            p = Path(root).expanduser()
            if not p.is_dir():
                self._json(400, {"error": "pasta_inexistente", "path": str(p)})
                return
            with config_lock:
                config["rootPath"] = str(p.resolve())
            self._json(200, {"ok": True, "rootPath": config["rootPath"]})
            return

        if self.path == "/scan/paths":
            body = self._read_json()
            try:
                root = resolve_root(body)
                payload = list_mp3_paths(root)
                self._json(200, {"ok": True, **payload})
            except ValueError as e:
                self._json(400, {"error": str(e)})
            except Exception as e:
                self._json(500, {"error": str(e)[:400]})
            return

        if self.path == "/scan/inventory":
            body = self._read_json()
            try:
                root = resolve_root(body)
                payload = scan_inventory(root)
                self._json(200, {"ok": True, **payload})
            except ValueError as e:
                self._json(400, {"error": str(e)})
            except Exception as e:
                self._json(500, {"error": str(e)[:400]})
            return

        self._json(404, {"error": "not_found"})

    def log_message(self, fmt: str, *args) -> None:
        return


def server_already_running() -> bool:
    import urllib.error
    import urllib.request

    for scheme in ("https", "http"):
        try:
            url = f"{scheme}://127.0.0.1:{PORT}/health"
            ctx = None
            if scheme == "https":
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(url, timeout=2, context=ctx) as res:
                data = json.loads(res.read().decode("utf-8"))
                if data.get("ok"):
                    return True
        except (urllib.error.URLError, OSError, json.JSONDecodeError, TimeoutError):
            continue
    return False


if __name__ == "__main__":
    if server_already_running():
        print(f"Servidor UP já está rodando em https://127.0.0.1:{PORT}")
        print("Use o portal: Criação → Servidor UP")
        sys.exit(0)

    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        httpd.allow_reuse_address = True
    except OSError as e:
        if e.errno in (48, 98):
            print(f"Porta {PORT} ocupada — feche a janela antiga do Servidor UP.")
            sys.exit(0)
        raise

    scheme = "http"
    if ensure_certs():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    print(f"Radio Ibiza Servidor UP em {scheme}://127.0.0.1:{PORT}")
    print(f"Staging: {STAGING_DIR}")
    if scheme == "https":
        print("")
        print("  1ª vez: abra no navegador e aceite o certificado:")
        print(f"  {scheme}://127.0.0.1:{PORT}/health")
        print("  Depois use Criação → Servidor UP no portal.")
        print("")
    print("  Deixe ESTA JANELA ABERTA durante a migração.")
    httpd.serve_forever()
