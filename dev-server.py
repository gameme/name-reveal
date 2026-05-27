#!/usr/bin/env python3
"""Dev server that serves static files and accepts log POSTs from mobile."""

import datetime
import http.server
import os
import re
import socket
from typing import Any  # Any required: SimpleHTTPRequestHandler.__init__ forwards arbitrary args/kwargs
from urllib.parse import parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(ROOT, "mobile-debug.log")
SESSIONS_DIR = os.path.join(ROOT, ".auto", "sessions")
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")  # safe filename, no path traversal


def get_lan_ip() -> str:
    """Resolve the machine's LAN IP by connecting to an external address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


class LogServer(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:  # Any required: matching parent signature
        kwargs["directory"] = ROOT
        super().__init__(*args, **kwargs)

    def do_GET(self) -> None:
        if self.path == "/ip":
            ip = get_lan_ip()
            body = ip.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def do_POST(self) -> None:
        path, _, query = self.path.partition("?")
        if path == "/log":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")

            # Per-session routing for parallel harness runs. ?session=<id> picks
            # .auto/sessions/<id>.log; missing/invalid session falls back to the
            # default mobile-debug.log so existing single-client beacons keep working.
            session_id = parse_qs(query).get("session", [None])[0]
            if session_id and SESSION_RE.match(session_id):
                os.makedirs(SESSIONS_DIR, exist_ok=True)
                target = os.path.join(SESSIONS_DIR, f"{session_id}.log")
            else:
                target = LOG_FILE

            # Reset log on new session (page load beacon)
            if "BEACON_INIT" in body:
                with open(target, "w") as f:
                    f.write(f"=== New session {timestamp} ===\n")
                    f.write(f"\n--- {timestamp} ---\n{body}\n")
            else:
                with open(target, "a") as f:
                    f.write(f"\n--- {timestamp} ---\n{body}\n")
            self.send_response(204)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        pass


if __name__ == "__main__":
    with open(LOG_FILE, "w") as f:
        f.write("=== Mobile debug log started ===\n")
    # ThreadingHTTPServer: handle concurrent /log POSTs from parallel harness
    # scenarios without serializing them behind one another. Single-threaded
    # HTTPServer was the bottleneck that made `run-all.py` lose beacons.
    server = http.server.ThreadingHTTPServer(("0.0.0.0", 8080), LogServer)
    print(f"Serving on http://0.0.0.0:8080 — logs → {LOG_FILE} (ThreadingHTTPServer)")
    server.serve_forever()
