#!/usr/bin/env python3
import argparse
import json
import os
import sys
import time
import wave


def fail(message: str, code: int = 2) -> None:
    sys.stderr.write(message.rstrip() + "\n")
    sys.exit(code)


if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK") == "1":
    fail(
        "PYTORCH_ENABLE_MPS_FALLBACK=1 is set. This tool requires MPS-only with no CPU fallback. Unset it and retry.",
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


def read_wav_mono_16k(path: str) -> np.ndarray:
    try:
        with wave.open(path, "rb") as wf:
            channels = wf.getnchannels()
            sample_rate = wf.getframerate()
            sample_width = wf.getsampwidth()
            frames = wf.getnframes()
            if channels != 1:
                fail(f"WAV must be mono (1 channel). Got {channels}: {path}")
            if sample_rate != 16000:
                fail(f"WAV must be 16kHz. Got {sample_rate}Hz: {path}")
            if sample_width != 2:
                fail(f"WAV must be 16-bit PCM. Got sample width {sample_width}: {path}")
            raw = wf.readframes(frames)
    except FileNotFoundError:
        fail(f"File not found: {path}")
    except wave.Error as exc:
        fail(f"Failed to read WAV: {path}\n{exc}")

    audio_i16 = np.frombuffer(raw, dtype=np.int16)
    audio_f32 = audio_i16.astype(np.float32) / 32768.0
    return audio_f32


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


def main() -> None:
    parser = argparse.ArgumentParser(prog="cb-phonemes")
    parser.add_argument("--wav", help="Path to 16kHz mono 16-bit PCM WAV")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="HuggingFace model id")
    parser.add_argument("--self-test", action="store_true", help="Verify MPS availability and exit")
    args = parser.parse_args()

    if not torch.backends.mps.is_built():
        fail("PyTorch is not built with MPS support.", 2)
    if not torch.backends.mps.is_available():
        fail("MPS is not available. This requires Apple Silicon with MPS enabled.", 2)

    if args.self_test:
        print(
            json.dumps(
                {
                    "ok": True,
                    "tool": {"name": "wav2vec2", "device": "mps", "torch": torch.__version__},
                }
            )
        )
        return

    if not args.wav:
        fail("Missing --wav argument.", 2)

    device = torch.device("mps")
    model_id = args.model

    t0 = time.time()
    feature_extractor = Wav2Vec2FeatureExtractor.from_pretrained(model_id)
    model = Wav2Vec2ForCTC.from_pretrained(model_id).to(device)
    model.eval()
    t_load = time.time()

    id_to_token = load_vocab(model_id)

    audio = read_wav_mono_16k(args.wav)
    inputs = feature_extractor(audio, sampling_rate=16000, return_tensors="pt")
    input_values = inputs.input_values.to(device)

    with torch.no_grad():
        logits = model(input_values).logits

    if logits.device.type != "mps":
        fail(f"Inference did not run on MPS (got {logits.device}).", 2)

    pred_ids = torch.argmax(logits, dim=-1)[0].to("cpu").tolist()
    blank_id = int(getattr(model.config, "pad_token_id", 0))
    collapsed = ctc_collapse(pred_ids, blank_id)

    tokens = [id_to_token.get(int(idx)) for idx in collapsed]
    special = {"<pad>", "<s>", "</s>", "<unk>"}

    phones = []
    for tok in tokens:
        if not tok:
            continue
        if tok in special:
            continue
        if tok == "|" or tok == "<pad>":
            continue
        phones.append(tok)

    if not phones:
        fail(f"Empty phone sequence for {args.wav}", 1)

    t_done = time.time()
    print(
        json.dumps(
            {
                "ok": True,
                "phones": phones,
                "tool": {
                    "name": "wav2vec2",
                    "model": model_id,
                    "device": "mps",
                    "torch": torch.__version__,
                    "transformers": __import__("transformers").__version__,
                },
                "timings_ms": {
                    "load_ms": (t_load - t0) * 1000.0,
                    "infer_ms": (t_done - t_load) * 1000.0,
                    "total_ms": (t_done - t0) * 1000.0,
                },
            }
        )
    )


if __name__ == "__main__":
    main()
