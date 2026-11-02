"""
@file workers/ai_worker.py
@package @ryuzei/botnest
@description High-performance IPC Unix socket worker for Python AI and heavy NLP pipelines.
"""

import json
import os
import signal
import socket
import sys
import time

SOCKET_PATH = "/tmp/botnest_ipc.sock"

def process_payload(payload: dict) -> dict:
    cmd = payload.get("command", "").lower()
    text = payload.get("text", "")
    platform = payload.get("platform", "unknown")

    start_ns = time.perf_counter_ns()

    if cmd == "tokenize":
        tokens = text.split()
        res = {
            "token_count": len(tokens),
            "char_count": len(text),
            "sample": tokens[:5]
        }
    elif cmd == "sentiment":
        score = 0.0
        positive_words = {"bueno", "excelente", "genial", "good", "great", "cool", "fast"}
        negative_words = {"malo", "pesimo", "error", "slow", "bad", "bug"}
        words = text.lower().split()
        for w in words:
            if w in positive_words:
                score += 1.0
            elif w in negative_words:
                score -= 1.0
        normalized_score = max(-1.0, min(1.0, score / (len(words) or 1)))
        res = {"sentiment_score": round(normalized_score, 2)}
    else:
        res = {"echo": text, "status": "processed"}

    elapsed_ms = (time.perf_counter_ns() - start_ns) / 1_000_000

    return {
        "status": "ok",
        "platform": platform,
        "runtime": "python3",
        "latency_ms": round(elapsed_ms, 3),
        "result": res
    }

def run_server():
    if os.path.exists(SOCKET_PATH):
        os.remove(SOCKET_PATH)

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(SOCKET_PATH)
    server.listen(16)
    os.chmod(SOCKET_PATH, 0o777)

    def handle_signal(sig, frame):
        if os.path.exists(SOCKET_PATH):
            os.remove(SOCKET_PATH)
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    sys.stdout.write(f"[Python Worker] IPC Socket listening on {SOCKET_PATH}\n")
    sys.stdout.flush()

    while True:
        conn, _ = server.accept()
        try:
            raw_data = b""
            while True:
                chunk = conn.recv(4096)
                if not chunk:
                    break
                raw_data += chunk
                if b"\n" in chunk:
                    break

            if raw_data:
                payload = json.loads(raw_data.decode("utf-8").strip())
                response = process_payload(payload)
                conn.sendall(json.dumps(response).encode("utf-8") + b"\n")
        except Exception as e:
            err_payload = {"status": "error", "error": str(e)}
            conn.sendall(json.dumps(err_payload).encode("utf-8") + b"\n")
        finally:
            conn.close()

if __name__ == "__main__":
    run_server()
