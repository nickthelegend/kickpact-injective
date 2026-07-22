#!/usr/bin/env python3
"""Render demo/narration.json to one WAV per segment with Kokoro TTS.

    python3 demo/narrate.py [outdir]

Needs kokoro-onnx plus the v1.0 model + voice pack. They're looked up in the
usual cache locations; override with KOKORO_MODEL / KOKORO_VOICES.
"""
import json
import os
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / "audio")

CANDIDATE_MODELS = [
    os.environ.get("KOKORO_MODEL"),
    Path.home() / ".cache/hyperframes/tts/models/kokoro-v1.0.onnx",
    Path.home() / ".cache/kokoro/kokoro-v1.0.onnx",
]
CANDIDATE_VOICES = [
    os.environ.get("KOKORO_VOICES"),
    Path.home() / ".cache/hyperframes/tts/voices/voices-v1.0.bin",
    Path.home() / ".cache/kokoro/voices-v1.0.bin",
]


def first_existing(paths, what):
    for p in paths:
        if p and Path(p).exists():
            return str(p)
    sys.exit(f"could not find the Kokoro {what}; set the env var or download it")


def main():
    from kokoro_onnx import Kokoro

    spec = json.loads((ROOT / "narration.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)

    tts = Kokoro(first_existing(CANDIDATE_MODELS, "model"), first_existing(CANDIDATE_VOICES, "voices"))
    voice, speed = spec.get("voice", "am_michael"), spec.get("speed", 1.0)

    total = 0.0
    for seg in spec["segments"]:
        samples, rate = tts.create(seg["text"], voice=voice, speed=speed, lang="en-us")
        path = OUT / f"{seg['id']}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            # kokoro hands back float32 in [-1, 1]
            w.writeframes((samples * 32767).astype("<i2").tobytes())
        secs = len(samples) / rate
        total += secs
        print(f"{seg['id']:<14} {secs:5.1f}s  {path}")

    print(f"\n{len(spec['segments'])} segments · {total:.0f}s of narration → {OUT}")


if __name__ == "__main__":
    main()
