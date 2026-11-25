"""Generates public/assets/sounds/sea_shanty_loop.wav, an original 6/8 sea-shanty loop (A minor).

Written for this project, so it carries no third-party licence. Run: python tools/generate-music.py
Requires numpy.
"""
import wave
from pathlib import Path

import numpy as np

SR = 22050
EIGHTH = 0.2  # seconds; 6 eighths per bar = 1.2 s
BAR = 6 * EIGHTH

# Chord per bar (root semitone from A4, melody pattern); two melody variants.
CHORDS = {
    "Am": dict(root=-24, tones=[-12, -9, -5], melody=[0, 3, 7, 12, 7, 3], alt=[12, None, 7, None, 3, 7]),
    "G": dict(root=-26, tones=[-14, -10, -7], melody=[-2, 2, 5, 10, 5, 2], alt=[10, None, 5, None, 2, 5]),
    "F": dict(root=-28, tones=[-16, -12, -9], melody=[-4, 0, 3, 8, 3, 0], alt=[8, None, 3, None, 0, 3]),
    "E": dict(root=-29, tones=[-17, -13, -10], melody=[-5, -1, 2, 7, 2, -1], alt=[7, None, 2, None, -1, 2]),
}
PROGRESSION = ["Am", "Am", "G", "Am", "Am", "F", "E", "E"]
SECTIONS = ["melody", "alt", "melody"]  # 24 bars, about 29 s

total = SR * int(len(PROGRESSION) * len(SECTIONS) * BAR + 2)
buf = np.zeros(total)


def hz(semi):
    return 440.0 * 2 ** (semi / 12)


def add(start, sig):
    i = int(start * SR)
    end = min(i + len(sig), total)
    buf[i:end] += sig[: end - i]


def tone(freq, dur, decay, kind):
    t = np.arange(int(dur * SR)) / SR
    if kind == "pluck":
        w = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(4 * np.pi * freq * t) + 0.15 * np.sin(6 * np.pi * freq * t)
    elif kind == "reed":  # accordion-like: a few odd harmonics
        w = sum(np.sin(2 * np.pi * freq * k * t) / k for k in (1, 2, 3, 5))
    else:
        w = np.sin(2 * np.pi * freq * t)
    return w * np.exp(-t * decay) * np.minimum(1, t * 400)


def kick(start):
    t = np.arange(int(0.18 * SR)) / SR
    f = 120 * np.exp(-t * 18) + 40
    add(start, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22))


rng = np.random.default_rng(7)


def hat(start, level):
    t = np.arange(int(0.05 * SR)) / SR
    add(start, rng.standard_normal(len(t)) * np.exp(-t * 70) * level)


bar_index = 0
for section in SECTIONS:
    for name in PROGRESSION:
        c = CHORDS[name]
        t0 = bar_index * BAR
        for step in range(6):
            s = t0 + step * EIGHTH
            if step in (0, 3):
                add(s, tone(hz(c["root"]), 0.55, 5, "pluck") * 0.55)
                kick(s)
            if step in (1, 2, 4, 5):
                for semi in c["tones"]:
                    add(s, tone(hz(semi), 0.28, 9, "reed") * 0.11)
            note = c[section][step]
            if note is not None:
                add(s, tone(hz(note), 0.34, 6, "pluck") * 0.3)
            hat(s, 0.05 if step % 3 else 0.09)
        bar_index += 1

loop_len = int(bar_index * BAR * SR)
out = buf[:loop_len].copy()
tail = buf[loop_len:]
out[: len(tail)] += tail  # let the last notes ring into the start so the loop is seamless
out = out / np.max(np.abs(out)) * 0.8

dest = Path(__file__).resolve().parent.parent / "public/assets/sounds/sea_shanty_loop.wav"
with wave.open(str(dest), "wb") as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(SR)
    f.writeframes((out * 32767).astype("<i2").tobytes())
print(dest, round(len(out) / SR, 1), "s")
