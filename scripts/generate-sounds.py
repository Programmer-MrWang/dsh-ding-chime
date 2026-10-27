"""
生成 dsh-ding 的内置预设音频。

全部为原创合成（正弦/三角波 + 指数衰减包络），无任何第三方采样，
可以随 MIT 插件自由分发。

输出：16-bit PCM / 44.1kHz / 单声道 WAV（Windows SoundPlayer 兜底也能播）。
"""
import math
import os
import struct
import sys

import numpy as np

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "sounds")


def envelope(n, attack=0.005, decay=0.35, power=2.2):
    """指数衰减包络：短促起音 + 平滑衰减，避免爆音。"""
    t = np.arange(n) / RATE
    a = np.minimum(t / max(attack, 1e-6), 1.0)
    d = np.exp(-power * t / max(decay, 1e-6))
    return a * d


def tone(freq, dur, amp=0.6, harmonics=((1.0, 1.0),), attack=0.005, decay=None, power=2.2):
    """单个音：freq 可含轻微的音高滑落，让听感更自然。"""
    n = int(RATE * dur)
    t = np.arange(n) / RATE
    if decay is None:
        decay = dur * 0.55
    sig = np.zeros(n)
    for ratio, weight in harmonics:
        sig += weight * np.sin(2 * np.pi * freq * ratio * t)
    total = sum(w for _, w in harmonics)
    if total:
        sig /= total
    return amp * sig * envelope(n, attack, decay, power)


def triangle_tone(freq, dur, amp=0.5, attack=0.004, decay=None, power=2.6):
    n = int(RATE * dur)
    t = np.arange(n) / RATE
    if decay is None:
        decay = dur * 0.5
    # 三角波用奇次谐波叠加，比正弦更"铃"一点，但不刺耳
    sig = np.zeros(n)
    for k in range(1, 12, 2):
        sig += ((-1) ** ((k - 1) // 2)) / (k * k) * np.sin(2 * np.pi * freq * k * t)
    return amp * sig * envelope(n, attack, decay, power)


def chime(notes, dur_each, gap=0.0, amp=0.6, harmonics=((1.0, 1.0), (2.0, 0.35), (3.0, 0.12))):
    """串起几个音，中间可留间隔。"""
    parts = []
    for i, (freq, mult) in enumerate(notes):
        d = dur_each * mult
        parts.append(tone(freq, d, amp=amp, harmonics=harmonics))
        if gap > 0 and i < len(notes) - 1:
            parts.append(np.zeros(int(RATE * gap)))
    return np.concatenate(parts) if parts else np.zeros(0)


def normalize(sig, peak=0.85):
    """归一化到目标峰值，并做 5ms 淡入淡出防止起止爆音。"""
    if len(sig) == 0:
        return sig
    m = np.max(np.abs(sig))
    if m > 0:
        sig = sig / m * peak
    fade = int(RATE * 0.005)
    if len(sig) > 2 * fade:
        sig[:fade] *= np.linspace(0, 1, fade)
        sig[-fade:] *= np.linspace(1, 0, fade)
    return sig


def write_wav(name, sig):
    os.makedirs(OUT, exist_ok=True)
    data = (np.clip(sig, -1.0, 1.0) * 32767).astype("<i2")
    path = os.path.join(OUT, name)
    with open(path, "wb") as f:
        payload = data.tobytes()
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + len(payload)))
        f.write(b"WAVEfmt ")
        f.write(struct.pack("<IHHIIHH", 16, 1, 1, RATE, RATE * 2, 2, 16))
        f.write(b"data")
        f.write(struct.pack("<I", len(payload)))
        f.write(payload)
    return path, len(data)


# ---------- 预设 ----------

def preset_ding():
    """Ding · 经典单声清脆提示。"""
    n = int(RATE * 0.7)
    t = np.arange(n) / RATE
    # 基频 + 泛音，带极轻微的音高下滑，听感更像真的敲击
    f0 = 1318.5  # E6
    sig = np.zeros(n)
    for ratio, weight, decay_k in ((1.0, 1.0, 6.0), (2.0, 0.30, 9.0), (3.0, 0.10, 12.0)):
        sig += weight * np.sin(2 * np.pi * f0 * ratio * (1 - 0.004 * t / 0.7) * t) * np.exp(-decay_k * t)
    return normalize(sig * envelope(n, 0.002, 0.45, 1.0))


def preset_chime():
    """Chime · 两三声上行的钟琴音。"""
    return normalize(chime(
        [(880.0, 1.0), (1174.7, 1.0), (1567.98, 1.35)],
        dur_each=0.42, gap=0.035, amp=0.55,
        harmonics=((1.0, 1.0), (2.0, 0.4), (3.0, 0.15), (4.0, 0.06)),
    ))


def preset_soft():
    """Soft · 柔和下降两音，适合长任务。"""
    return normalize(chime(
        [(987.77, 1.0), (739.99, 1.5)],
        dur_each=0.5, gap=0.04, amp=0.45,
        harmonics=((1.0, 1.0), (2.0, 0.22)),
    ))


def preset_alert():
    """Alert · 三声紧促三角波，用于"需要你回复"。"""
    parts = []
    for _ in range(3):
        parts.append(triangle_tone(1046.5, 0.13, amp=0.5, power=3.0))
        parts.append(np.zeros(int(RATE * 0.07)))
    return normalize(np.concatenate(parts), peak=0.8)


def preset_error():
    """Error · 下行小调两音，明确但不刺耳。"""
    return normalize(chime(
        [(440.0, 1.0), (329.63, 1.8)],
        dur_each=0.34, gap=0.02, amp=0.5,
        harmonics=((1.0, 1.0), (2.0, 0.28), (3.0, 0.1)),
    ))


PRESETS = {
    "ding": preset_ding,
    "chime": preset_chime,
    "soft": preset_soft,
    "alert": preset_alert,
    "error": preset_error,
}


def main():
    made = []
    for name, fn in PRESETS.items():
        sig = fn()
        path, samples = write_wav(f"{name}.wav", sig)
        made.append((name, path, samples, len(sig) / RATE))
    for name, path, samples, dur in made:
        size = os.path.getsize(path)
        print(f"{name:8s} {dur:5.2f}s {size:7d}B {samples:6d} samples")


if __name__ == "__main__":
    main()
