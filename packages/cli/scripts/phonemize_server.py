#!/usr/bin/env python3
import argparse
import io
import json
import os
import sys
import time
import threading
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def fail(message: str, code: int = 2) -> None:
    sys.stderr.write(message.rstrip() + "\n")
    sys.exit(code)


if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK") == "1":
    fail(
        "PYTORCH_ENABLE_MPS_FALLBACK=1 is set. This server requires MPS-only with no CPU fallback. Unset it and retry.",
        2,
    )

os.environ["PYTORCH_ENABLE_MPS_FALLBACK"] = "0"

try:
    import numpy as np
    import torch
    from huggingface_hub import hf_hub_download
    from transformers import Wav2Vec2FeatureExtractor, Wav2Vec2ForCTC
except Exception as exc:
    fail(f"Missing Python dependency: {exc}. Install: pip3 install torch transformers numpy", 2)


DEFAULT_MODEL = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"


def ctc_collapse(ids, blank_id: int):
    collapsed = []
    prev = None
    for idx in ids:
        if idx == prev:
            continue
        prev = idx
        if idx == blank_id:
            continue
        collapsed.append(idx)
    return collapsed


def load_vocab(model_id: str) -> dict[int, str]:
    vocab_path = hf_hub_download(repo_id=model_id, filename="vocab.json")
    with open(vocab_path, "r", encoding="utf-8") as f:
        token_to_id = json.load(f)
    id_to_token: dict[int, str] = {}
    for token, idx in token_to_id.items():
        id_to_token[int(idx)] = token
    return id_to_token


def read_wav_mono_16k_from_bytes(raw: bytes) -> np.ndarray:
    try:
        with wave.open(io.BytesIO(raw), "rb") as wf:
            channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            sample_width = wf.getsampwidth()
            frames = wf.getnframes()
            if channels != 1:
                raise ValueError(f"WAV must be mono (1 channel), got {channels}")
            if sample_rate != 16000:
                raise ValueError(f"WAV must be 16kHz, got {sample_rate}Hz")
            if sample_width != 2:
                raise ValueError(f"WAV must be 16-bit PCM, got sample width {sample_width}")
            pcm = wf.readframes(frames)
    except wave.Error as exc:
        raise ValueError(f"Failed to decode WAV: {exc}")

    audio_i16 = np.frombuffer(pcm, dtype=np.int16)
    return audio_i16.astype(np.float32) / 32768.0


class Runtime:
    def __init__(
        self,
        model_id: str,
        max_payload_bytes: int,
        max_inflight: int,
        max_queue: int,
        queue_wait_seconds: float,
        forced_align_enabled: bool,
    ):
        if not torch.backends.mps.is_built():
            fail("PyTorch is not built with MPS support.", 2)
        if not torch.backends.mps.is_available():
            fail("MPS is not available. This requires Apple Silicon with MPS enabled.", 2)

        self.model_id = model_id
        self.max_payload_bytes = max_payload_bytes
        self.max_inflight = max_inflight
        self.max_queue = max_queue
        self.queue_wait_seconds = queue_wait_seconds
        self.forced_align_enabled = forced_align_enabled

        self.device = torch.device("mps")

        t0 = time.time()
        self.feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(model_id)
        self.model = Wav2Vec2ForCTC.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.id_to_token = load_vocab(model_id)
        self.load_ms = (time.time() - t0) * 1000.0

        self.special_tokens = {"<pad>", "<s>", "</s>", "<unk>", "|"}

        self._cv = threading.Condition()
        self._active = 0
        self._queued = 0

    def queue_snapshot(self) -> dict:
        with self._cv:
            return {"active": self._active, "queued": self._queued}

    def acquire_slot(self) -> bool:
        deadline = time.time() + max(0.1, self.queue_wait_seconds)
        with self._cv:
            if self._active < self.max_inflight:
                self._active += 1
                return True

            if self._queued >= self.max_queue:
                return False

            self._queued += 1
            try:
                while True:
                    remaining = deadline - time.time()
                    if remaining <= 0:
                        return False
                    self._cv.wait(timeout=remaining)
                    if self._active < self.max_inflight:
                        self._active += 1
                        return True
            finally:
                self._queued = max(0, self._queued - 1)

    def release_slot(self) -> None:
        with self._cv:
            self._active = max(0, self._active - 1)
            self._cv.notify()

    def phonemize_wav_bytes(self, wav_bytes: bytes) -> dict:
        audio = read_wav_mono_16k_from_bytes(wav_bytes)

        t0 = time.time()
        inputs = self.feature_extractor(audio, sampling_rate=16000, return_tensors="pt")
        input_values = inputs.input_values.to(self.device)

        with torch.no_grad():
            logits = self.model(input_values).logits

        if logits.device.type != "mps":
            raise RuntimeError(f"Inference did not run on MPS (got {logits.device}).")

        pred_ids = torch.argmax(logits, dim=-1)[0].to("cpu").tolist()
        blank_id = int(getattr(self.model.config, "pad_token_id", 0))
        collapsed = ctc_collapse(pred_ids, blank_id)

        phones = []
        for idx in collapsed:
            tok = self.id_to_token.get(int(idx))
            if not tok or tok in self.special_tokens:
                continue
            phones.append(tok)

        if not phones:
            raise RuntimeError("Empty phone sequence")

        infer_ms = (time.time() - t0) * 1000.0
        return {
            "ok": True,
            "phones": phones,
            "tool": {
                "name": "wav2vec2",
                "model": self.model_id,
                "device": "mps",
                "torch": torch.__version__,
                "transformers": __import__("transformers").__version__,
            },
            "timings_ms": {
                "load_ms": self.load_ms,
                "infer_ms": infer_ms,
                "total_ms": infer_ms,
            },
        }


RUNTIME: Runtime | None = None


class Handler(BaseHTTPRequestHandler):
    server_version = "cb-phonemize/1.0"

    def log_message(self, fmt: str, *args) -> None:
        # Quiet by default; uncomment for verbose request logs.
        return

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        runtime = RUNTIME
        if self.path == "/health":
            if runtime is None:
                self._send_json(503, {"ok": False, "error": "not_initialized"})
                return
            q = runtime.queue_snapshot()
            self._send_json(
                200,
                {
                    "ok": True,
                    "model": runtime.model_id,
                    "device": "mps",
                    "warm": True,
                    "active": q["active"],
                    "queued": q["queued"],
                    "max_inflight": runtime.max_inflight,
                    "max_queue": runtime.max_queue,
                    "forced_align_enabled": runtime.forced_align_enabled,
                },
            )
            return
        self._send_json(404, {"ok": False, "error": "not_found"})

    def do_POST(self) -> None:
        runtime = RUNTIME
        if runtime is None:
            self._send_json(503, {"ok": False, "error": "not_initialized"})
            return

        if self.path == "/forced-align":
            if not runtime.forced_align_enabled:
                self._send_json(404, {"ok": False, "error": "forced_align_disabled"})
                return
            self._send_json(501, {"ok": False, "error": "forced_align_not_implemented"})
            return

        if self.path != "/phonemize":
            self._send_json(404, {"ok": False, "error": "not_found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0") or "0")
        except Exception:
            content_length = 0
        if content_length <= 0:
            self._send_json(400, {"ok": False, "error": "empty_body"})
            return
        if content_length > runtime.max_payload_bytes:
            self._send_json(413, {"ok": False, "error": "payload_too_large", "max_payload_bytes": runtime.max_payload_bytes})
            return

        if not runtime.acquire_slot():
            self._send_json(503, {"ok": False, "error": "queue_full_or_timeout"})
            return

        try:
            body = self.rfile.read(content_length)
            if not body:
                self._send_json(400, {"ok": False, "error": "empty_body"})
                return
            out = runtime.phonemize_wav_bytes(body)
            self._send_json(200, out)
        except Exception as exc:
            self._send_json(400, {"ok": False, "error": str(exc)})
        finally:
            runtime.release_slot()


def main() -> None:
    parser = argparse.ArgumentParser(prog="cb-phonemize-server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18923)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--max-payload-bytes", type=int, default=8 * 1024 * 1024)
    parser.add_argument("--max-inflight", type=int, default=1)
    parser.add_argument("--max-queue", type=int, default=8)
    parser.add_argument("--queue-wait-seconds", type=float, default=30.0)
    args = parser.parse_args()

    forced_align_enabled = os.environ.get("CIRCUIT_BREAKER_FORCED_ALIGN", "") == "1"

    global RUNTIME
    RUNTIME = Runtime(
        model_id=args.model,
        max_payload_bytes=max(1024, int(args.max_payload_bytes)),
        max_inflight=max(1, int(args.max_inflight)),
        max_queue=max(0, int(args.max_queue)),
        queue_wait_seconds=max(0.5, float(args.queue_wait_seconds)),
        forced_align_enabled=forced_align_enabled,
    )

    server = ThreadingHTTPServer((args.host, int(args.port)), Handler)
    sys.stderr.write(
        f"phonemize_server listening on http://{args.host}:{args.port} "
        f"model={args.model} max_inflight={RUNTIME.max_inflight} max_queue={RUNTIME.max_queue}\\n"
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
