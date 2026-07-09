"""Scan de pastas legado + ffprobe no PC local."""

from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path
from typing import Any

MP3_SUFFIX = ".mp3"


def split_relative_path(path: str) -> list[str]:
    return [s.strip() for s in path.replace("\\", "/").split("/") if s.strip() and s.strip() != "."]


def strip_macosx_prefix(segments: list[str]) -> list[str]:
    if segments and segments[0].lower() == "__macosx":
        return segments[1:]
    return segments


def normalize_search_line(name: str) -> str:
    s = name.strip()
    s = re.sub(r"\.(mp3|flac|m4a|wav)$", "", s, flags=re.I)
    s = re.sub(r"~\d+$", "", s, flags=re.I)
    s = re.sub(r"\s*\(\d+\)\s*$", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_artist_title(filename: str) -> tuple[str, str]:
    base = normalize_search_line(filename)
    m = re.match(r"^(.+?)\s*[-–—]\s*(.+)$", base)
    if not m:
        stem = Path(filename).stem
        return ("", stem.strip())
    artista = m.group(1).strip()
    titulo = m.group(2).strip()
    return (artista, titulo)


def hierarchy_key_from_relative(relative_path: str) -> tuple[str, str, str] | None:
    segments = strip_macosx_prefix(split_relative_path(relative_path))
    if len(segments) < 2:
        return None
    if not segments[-1].lower().endswith(MP3_SUFFIX):
        return None
    folder_segs = segments[:-1]
    if len(folder_segs) < 3:
        return None
    pasta = folder_segs[-1]
    programacao = folder_segs[-2]
    cliente = folder_segs[-3]
    return (cliente, programacao, pasta)


def iter_mp3_files(root: Path) -> list[Path]:
    out: list[Path] = []
    if not root.is_dir():
        return out
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() == MP3_SUFFIX:
            if "__MACOSX" in path.parts:
                continue
            out.append(path)
    out.sort(key=lambda p: str(p).lower())
    return out


def ffprobe_available() -> bool:
    try:
        subprocess.run(
            ["ffprobe", "-version"],
            check=False,
            capture_output=True,
            timeout=5,
        )
        return True
    except (OSError, subprocess.TimeoutExpired):
        return False


def probe_mp3(path: Path) -> dict[str, Any]:
    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            return {"durationSec": None, "bitrateKbps": None}
        data = json.loads(proc.stdout or "{}")
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        return {"durationSec": None, "bitrateKbps": None}

    duration_sec: float | None = None
    fmt = data.get("format") or {}
    if fmt.get("duration"):
        try:
            duration_sec = round(float(fmt["duration"]), 2)
        except (TypeError, ValueError):
            duration_sec = None

    bitrate_kbps: int | None = None
    if fmt.get("bit_rate"):
        try:
            bitrate_kbps = int(round(int(fmt["bit_rate"]) / 1000))
        except (TypeError, ValueError):
            bitrate_kbps = None

    audio = None
    for stream in data.get("streams") or []:
        if stream.get("codec_type") == "audio":
            audio = stream
            break
    if audio and audio.get("bit_rate") and not bitrate_kbps:
        try:
            bitrate_kbps = int(round(int(audio["bit_rate"]) / 1000))
        except (TypeError, ValueError):
            pass

    return {"durationSec": duration_sec, "bitrateKbps": bitrate_kbps}


def scan_inventory(root: Path, *, max_files: int = 20_000) -> dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"pasta_inexistente: {root}")

    tracks: list[dict[str, Any]] = []
    skipped = 0

    for mp3 in iter_mp3_files(root):
        if len(tracks) >= max_files:
            skipped += 1
            continue
        try:
            rel = mp3.relative_to(root).as_posix()
        except ValueError:
            skipped += 1
            continue

        hierarchy = hierarchy_key_from_relative(rel)
        if not hierarchy:
            skipped += 1
            continue

        cliente, programacao, pasta = hierarchy
        artista, titulo = parse_artist_title(mp3.name)
        meta = probe_mp3(mp3)

        try:
            size_bytes = mp3.stat().st_size
        except OSError:
            size_bytes = 0

        tracks.append(
            {
                "relativePath": rel,
                "fileName": mp3.name,
                "clienteNome": cliente,
                "programacaoNome": programacao,
                "pastaNome": pasta,
                "artista": artista,
                "titulo": titulo,
                "durationSec": meta["durationSec"],
                "bitrateKbps": meta["bitrateKbps"],
                "sizeBytes": size_bytes,
            }
        )

    return {
        "rootPath": str(root),
        "tracks": tracks,
        "stats": {
            "total": len(tracks),
            "skipped": skipped,
            "ffprobe": ffprobe_available(),
        },
    }


def list_mp3_paths(root: Path, *, max_files: int = 50_000) -> dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"pasta_inexistente: {root}")

    files: list[dict[str, str]] = []
    skipped = 0
    for mp3 in iter_mp3_files(root):
        if len(files) >= max_files:
            skipped += 1
            continue
        try:
            rel = mp3.relative_to(root).as_posix()
        except ValueError:
            skipped += 1
            continue
        hierarchy = hierarchy_key_from_relative(rel)
        if not hierarchy:
            skipped += 1
            continue
        files.append({"path": rel})
    return {"rootPath": str(root), "files": files, "stats": {"total": len(files), "skipped": skipped}}
