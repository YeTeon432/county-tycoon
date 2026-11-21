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


def swell(t, duration, attack, release):
    """A raised-cosine fade on each end, with zero slope at the joins."""
    rise = np.sin(np.pi / 2 * np.minimum(1, t / attack)) ** 2
    fall = np.sin(np.pi / 2 * np.minimum(1, (duration - t) / release)) ** 2
    return rise * fall


def strings(midi, seconds):
    t = time(seconds)
    phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
    # Slightly spread tuning and a slow bow stroke soften the held chord.
    body = .66 * np.sin(phase) + .34 * np.sin(phase * 1.0011)
    body += .17 * np.sin(2 * phase) + .09 * np.sin(3 * phase)
    return body * swell(t, seconds, 2.4, 2.6)


def flute(phrase, air):
    """One breath per phrase. Slide into the next pitch without a new attack."""
    seconds = sum(length for _, length in phrase)
    t = time(seconds)
    pitches = np.full(len(t), float(phrase[0][0]))
    position = 0
    for pitch, length in phrase:
        if position:
            glide = np.clip((t - position + .07) / .13, 0, 1)
            pitches += (pitch - previous) * glide**2 * (3 - 2 * glide)
        previous = pitch
        position += length
    freq = 440 * 2 ** ((pitches - 69) / 12)
    freq *= 1 + .0018 * np.sin(2 * np.pi * 4.4 * t) * np.minimum(1, t)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    body = np.sin(phase) + .19 * np.sin(2 * phase) + .07 * np.sin(3 * phase)
    breath = np.convolve(air.normal(size=len(t)), np.ones(8) / 8, 'same')
    dynamics = .86 + .14 * np.sin(np.pi * t / seconds)
    return (body + .10 * breath) * dynamics * swell(t, seconds, .54, .88)


def theme():
    # Free-time D major. All score positions and lengths are in seconds.
    duration = 76
    chords = [(0, (50, 57, 64, 66)), (11, (47, 54, 62, 69)),
              (20, (43, 55, 62, 69)), (30, (50, 57, 62, 66)),
              (39, (52, 59, 62, 67)), (50, (43, 55, 62, 66)),
              (60, (45, 57, 62, 64)), (68, (45, 54, 61, 64))]
    # Render the tail of the last chord across the loop boundary.
    bed = np.zeros(round((duration + 3) * RATE))
    for i, (start, chord) in enumerate(chords):
        end = chords[i + 1][0] if i + 1 < len(chords) else duration
        for pitch, gain in zip(chord, (.077, .059, .042, .037)):
            sound = strings(pitch, end - start + 2.6)
            offset = round(start * RATE)
            bed[offset:offset + len(sound)] += gain * sound
    samples = bed[:duration * RATE].copy()
    tail = bed[duration * RATE:]
    samples[:len(tail)] += tail

    phrases = [
        (3.6, [(69, 2.1), (73, 1.2), (74, 3.5)]),
        (13.4, [(74, 1.5), (71, 2.8), (69, 2.6)]),
        (24.8, [(67, 2.5), (69, 1.4), (74, 3.1), (73, 1.6)]),
        (38.1, [(71, 2.4), (74, 1.8), (76, 3.3)]),
        (50.5, [(78, 1.9), (76, 1.3), (74, 3.6)]),
        (63.3, [(71, 2.1), (69, 2.8), (66, 3.4)]),
    ]
    air = np.random.default_rng(1565)
    melody = mix(duration, [(start, flute(phrase, air), .155) for start, phrase in phrases])
    samples += melody
    for delay, gain in [(.081, .085), (.173, .045), (.281, .025)]:
        samples += gain * np.roll(melody, round(delay * RATE))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(RATE),
                    '-ac', '1', '-i', '-', '-codec:a', 'libmp3lame', '-b:a', '64k',
                    str(OUT / 'town-theme.mp3')], input=pcm(samples), check=True)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    cues()
    theme()
