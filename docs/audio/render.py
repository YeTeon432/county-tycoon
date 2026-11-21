"""Render the original county theme and cues. Requires NumPy and ffmpeg."""
from pathlib import Path
import subprocess
import wave

import numpy as np

OUT = Path(__file__).resolve().parents[2] / 'county-tycoon/assets/resources/audio'
RATE = 32000
rng = np.random.default_rng(565)


def time(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def note(midi, seconds):
    t = time(seconds)
    freq = 440 * 2 ** ((midi - 69) / 12)
    phase = 2 * np.pi * freq * t
    signal = np.sin(phase) + 0.36 * np.sin(2.003 * phase) * np.exp(-t * 8)
    signal += 0.20 * np.sin(3.01 * phase) * np.exp(-t * 12)
    envelope = (1 - np.exp(-t * 260)) * np.exp(-t * 4.8)
    return signal * envelope * np.clip((seconds - t) / 0.055, 0, 1)


def knock(seconds, freq, decay, grit):
    t = time(seconds)
    noise = np.convolve(rng.uniform(-1, 1, len(t)), np.ones(4) / 4, 'same')
    ring = np.sin(2 * np.pi * freq * t + 2.2 * (1 - np.exp(-80 * t)))
    return (ring + grit * noise) * np.exp(-decay * t) * np.minimum(1, t * 1250) * np.minimum(1, (seconds - t) * 150)


def mix(seconds, parts):
    samples = np.zeros(len(time(seconds)))
    for start, sound, gain in parts:
        i = round(start * RATE)
        length = min(len(sound), len(samples) - i)
        samples[i:i + length] += gain * sound[:length]
    return samples


def pcm(signal):
    return (32767 * np.clip(signal, -1, 1)).astype('<i2').tobytes()


def cues():
    sounds = {
        'tap': knock(.07, 875, 85, .25) * .19,
        'road': mix(.12, [(0, knock(.1, 194, 45, 2.6), .18), (.032, knock(.085, 360, 52, 2.3), .14)]),
        'build': mix(.18, [(0, knock(.18, 164, 24, .48), .49), (.018, knock(.09, 390, 68, .55), .16)]),
        'blocked': mix(.18, [(0, knock(.08, 295, 44, .15), .23), (.09, knock(.09, 230, 40, .15), .2)]),
        'remove': mix(.22, [(i, knock(.22-i, f, 33, 3), g) for i, f, g in
                            [(0, 280, .18), (.037, 395, .19), (.084, 230, .16), (.13, 190, .12)]]),
        'complete': mix(.30, [(0, note(81, .30), .38), (0, knock(.055, 1350, 80, .25), .11)]),
        'wish': mix(.45, [(0, note(74, .26), .38), (.14, note(81, .31), .42)]),
        'promote': mix(.90, [(0, note(74, .39), .40), (.18, note(78, .39), .40),
                             (.38, note(81, .52), .46), (.38, note(62, .52), .18)]),
    }
    for name, samples in sounds.items():
        with wave.open(str(OUT / (name + '.wav')), 'wb') as out:
            out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
            out.writeframes(pcm(samples))


def soft_piano(midi, seconds):
    t = time(seconds)
    freq = 440 * 2 ** ((midi - 69) / 12)
    tone = np.zeros_like(t)
    # Two nearly unison strings. Higher partials decay first under a felt hammer.
    for harmonic, weight in enumerate((1, .38, .19, .09, .04), start=1):
        phase = 2 * np.pi * freq * harmonic * (1 + .00009 * harmonic**2) * t
        strings = .68 * np.sin(phase) + .32 * np.sin(phase * 1.0008)
        tone += weight * strings * np.exp(-t * (.84 + .5 * harmonic))
    attack = 1 - np.exp(-t / .024)
    release = np.clip((seconds - t) / .30, 0, 1)
    return tone * attack * release


def theme():
    # G-major pentatonic. A two-note pickup returns in the third phrase.
    # Each event is (beat, MIDI note, length in beats, touch).
    beat = 60 / 96
    score = [
        (.50, 67, .44, .17), (1.00, 69, .44, .18), (1.50, 71, 1.35, .23),
        (3.00, 74, 1.65, .21), (5.00, 71, .66, .18), (5.75, 69, 1.55, .19),

        (8.20, 71, .68, .19), (9.00, 69, .42, .16), (9.50, 67, 1.40, .22),
        (11.25, 64, .66, .17), (12.00, 67, 2.60, .21),

        (16.50, 67, .44, .16), (17.00, 69, .44, .18), (17.50, 71, 1.35, .22),
        (19.00, 74, .70, .19), (19.75, 76, 1.65, .21), (21.75, 74, 1.35, .18),

        (24.00, 71, 1.30, .21), (25.50, 74, .66, .18), (26.25, 69, 1.35, .18),
        (28.00, 67, 2.75, .21),
    ]
    samples = mix(32 * beat, [(start * beat, soft_piano(pitch, length * beat), gain)
                              for start, pitch, length, gain in score])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE),
                    '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '64k',
                    str(OUT / 'town-theme.mp3')], input=pcm(samples), check=True)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    cues()
    theme()
