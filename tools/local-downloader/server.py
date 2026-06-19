#!/usr/bin/env python3
"""
Radio Ibiza — Downloader local (yt-dlp no SEU computador)
=========================================================
O portal não baixa áudio no servidor (IP da empresa bloqueia).
Este app roda na sua máquina e o navegador fala com http://127.0.0.1:8765

Uso rápido:
  Windows: duplo clique Iniciar-Downloader.bat
  Mac: duplo clique Iniciar-Downloader.command
  Terminal: ./start.sh ou python3 server.py

Spotify: o portal resolve a playlist (só metadados) e manda a lista de faixas aqui.
Este app busca no YouTube via yt-dlp e converte para MP3 192k.
"""

from __future__ import annotations

import base64
import json
import re
import ssl
import subprocess
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import yt_dlp

PORT = 8765
CERT_DIR = Path(__file__).resolve().parent / "certs"
CERT_FILE = CERT_DIR / "localhost.pem"
KEY_FILE = CERT_DIR / "localhost-key.pem"
OUT_DIR = Path.home() / "Downloads" / "RadioIbiza-downloads"
OUT_DIR.mkdir(parents=True, exist_ok=True)

jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()


def safe_name(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', " ", name).strip()[:180] or "faixa"


def download_track(title: str, artist: str, suggested: str, out_dir: Path) -> Path:
    query = f"ytsearch1:{title} {artist} audio"
    stem = safe_name(suggested.replace(".mp3", ""))
    out_template = str(out_dir / f"{stem}.%(ext)s")
    opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "default_search": "ytsearch",
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.extract_info(query, download=True)
    mp3 = out_dir / f"{stem}.mp3"
    if mp3.exists():
        return mp3
    matches = sorted(out_dir.glob(f"{stem}*.mp3"), key=lambda p: p.stat().st_mtime)
    if matches:
        return matches[-1]
    raise RuntimeError("MP3 não gerado")


def run_job(job_id: str) -> None:
    with jobs_lock:
        job = jobs[job_id]
        job["status"] = "running"

    out_dir = OUT_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    for item in job["items"]:
        if job.get("cancel"):
            break
        item["status"] = "downloading"
        try:
            path = download_track(
                item["title"],
                item["artist"],
                item["suggestedFilename"],
                out_dir,
            )
            item["status"] = "done"
            item["path"] = str(path)
            item["sizeBytes"] = path.stat().st_size
            job["done"] += 1
        except Exception as e:
            item["status"] = "failed"
            item["error"] = str(e)[:400]
            job["failed"] += 1

    with jobs_lock:
        job["status"] = "cancelled" if job.get("cancel") else ("failed" if job["failed"] == job["total"] else "done")


class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Site HTTPS (Netlify) → localhost: Chrome exige isso (Private Network Access).
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json(200, {"ok": True, "version": 1})
            return

        m = re.match(r"^/jobs/([^/]+)/files$", self.path)
        if m:
            job_id = m.group(1)
            with jobs_lock:
                job = jobs.get(job_id)
            if not job:
                self._json(404, {"error": "not_found"})
                return
            files = []
            for item in job["items"]:
                if item.get("status") != "done" or not item.get("path"):
                    continue
                p = Path(item["path"])
                if not p.exists():
                    continue
                raw = p.read_bytes()
                files.append({
                    "filename": p.name,
                    "mime": "audio/mpeg",
                    "base64": base64.b64encode(raw).decode("ascii"),
                })
            self._json(200, {"files": files})
            return

        m = re.match(r"^/jobs/([^/]+)$", self.path)
        if m:
            job_id = m.group(1)
            with jobs_lock:
                job = jobs.get(job_id)
            if not job:
                self._json(404, {"error": "not_found"})
                return
            self._json(200, public_job(job))
            return

        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/jobs":
            self._json(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_json"})
            return

        tracks = body.get("tracks") or []
        if not tracks:
            self._json(400, {"error": "tracks_required"})
            return

        job_id = str(uuid.uuid4())
        items = []
        for t in tracks:
            items.append({
                "id": str(uuid.uuid4()),
                "title": t.get("title") or "",
                "artist": t.get("artist") or "",
                "suggestedFilename": t.get("suggestedFilename") or "faixa.mp3",
                "status": "pending",
            })

        job = {
            "id": job_id,
            "status": "queued",
            "total": len(items),
            "done": 0,
            "failed": 0,
            "items": items,
            "cancel": False,
        }
        with jobs_lock:
            jobs[job_id] = job

        threading.Thread(target=run_job, args=(job_id,), daemon=True).start()
        self._json(200, public_job(job))

    def log_message(self, fmt: str, *args) -> None:
        return


def public_job(job: dict) -> dict:
    return {
        "id": job["id"],
        "status": job["status"],
        "total": job["total"],
        "done": job["done"],
        "failed": job["failed"],
        "items": [
            {
                "id": i["id"],
                "title": i["title"],
                "artist": i["artist"],
                "suggestedFilename": i["suggestedFilename"],
                "status": i["status"],
                "error": i.get("error"),
                "sizeBytes": i.get("sizeBytes"),
            }
            for i in job["items"]
        ],
    }


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)

    scheme = "http"
    if CERT_FILE.exists() and KEY_FILE.exists():
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT_FILE), keyfile=str(KEY_FILE))
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"

    print(f"Radio Ibiza local downloader em {scheme}://127.0.0.1:{PORT}")
    print(f"Arquivos em {OUT_DIR}")
    if scheme == "https":
        print("")
        print("  IMPORTANTE (1ª vez): abra no navegador:")
        print(f"  {scheme}://127.0.0.1:{PORT}/health")
        print("  Aceite o certificado local → depois o portal mostra 'conectado'.")
        print("")
    httpd.serve_forever()
