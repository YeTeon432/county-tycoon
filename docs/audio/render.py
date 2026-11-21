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


def note(midi, seconds, voice='pluck'):
    t = time(seconds)
    freq = 440 * 2 ** ((midi - 69) / 12)
    phase = 2 * np.pi * freq * t
    if voice == 'reed':
        phase += 0.09 * np.sin(2 * np.pi * 4.6 * t)
        signal = np.sin(phase) + 0.17 * np.sin(2 * phase) + 0.06 * np.sin(3 * phase)
        envelope = (1 - np.exp(-t / 0.05)) * np.exp(-t / 2)
    else:
        signal = np.sin(phase) + 0.36 * np.sin(2.003 * phase) * np.exp(-t * 8)
        signal += 0.20 * np.sin(3.01 * phase) * np.exp(-t * 12)
        envelope = (1 - np.exp(-t * 260)) * np.exp(-t * (3 if voice == 'bass' else 4.8))
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


def theme():
    # 24 bars in D. The middle eight answer the plucked melody with a soft reed.
    beat = 60 / 92
    chords = [(50, 57, 62, 66), (47, 54, 59, 62), (43, 50, 55, 59), (45, 52, 57, 64),
              (50, 57, 62, 66), (43, 50, 59, 62), (45, 52, 57, 61), (50, 57, 62, 66)]
    # (pitch, beats); 0 denotes a rest.
    phrases = [
        [(0,.5),(69,.5),(74,1),(76,.5),(78,1.5)], [(78,1),(76,.5),(74,.5),(71,1.5),(0,.5)],
        [(67,.5),(69,.5),(71,1),(74,1.5),(71,.5)], [(69,2),(0,.5),(64,.5),(69,1)],
        [(74,.75),(76,.25),(78,1),(81,1.5),(78,.5)], [(76,1),(74,1),(71,1.5),(67,.5)],
        [(69,.5),(71,.5),(73,1),(76,1),(69,1)], [(74,2.5),(0,1.5)],
        [(78,1.5),(81,.5),(83,1),(81,1)], [(78,2),(76,1),(74,1)],
        [(79,1),(78,.5),(76,.5),(74,2)], [(76,2.5),(0,.5),(69,1)],
        [(74,.5),(78,.5),(81,1),(86,1.5),(81,.5)], [(83,1.5),(81,.5),(79,2)],
        [(76,1),(73,1),(69,1),(71,1)], [(74,3),(0,1)],
        [(0,.5),(69,.5),(74,1),(76,.5),(78,1.5)], [(78,1),(81,.5),(78,.5),(76,1),(74,1)],
        [(71,1),(67,.5),(69,.5),(74,1.5),(71,.5)], [(69,2.5),(0,1.5)],
        [(74,.5),(76,.5),(78,1),(81,1),(78,1)], [(79,1),(78,1),(74,1),(71,1)],
        [(69,.5),(71,.5),(73,1),(76,1),(69,1)], [(74,3),(0,1)]]
    parts = []
    for bar, melody in enumerate(phrases):
        start = bar * 4 * beat
        chord = chords[bar % 8]
        parts.append((start, note(chord[0]-12, 1.65, 'bass'), .20))
        for pos, tone in [(0.52, 1), (1.04, 2), (1.54, 3), (2.52, 1), (3.03, 3)]:
            parts.append((start + pos * beat, note(chord[tone], .84), .105))
        pos = 0
        for pitch, length in melody:
            if pitch:
                voice = 'reed' if 8 <= bar < 16 else 'pluck'
                parts.append((start + pos * beat, note(pitch, length * beat * .94, voice), .24))
            pos += length
    samples = mix(24 * 4 * beat, parts)
    # A short room reflection, taper the last millisecond to meet the silent downbeat.
    delay = round(.091 * RATE)
    samples[delay:] += .13 * samples[:-delay].copy()
    samples[-64:] *= np.linspace(1, 0, 64)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE),
                    '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '64k',
                    str(OUT / 'town-theme.mp3')], input=pcm(samples), check=True)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    cues()
    theme()
