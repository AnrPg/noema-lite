# `music@1` — music theory and acoustics (`src/engines/music/music.ts`, `NoemaLibMusic`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for pitch, tuning, intervals, scales, chords, pitch-class sets,
voice leading, rhythm, timbre and roughness, with **sounds to play**. Pitches are **spelled** (on the line of fifths, Temperley
2000), so A4 is not d5 and G♯ is not A♭ until a tuning makes them equal: a tuning turns spelled pitches into frequencies. The
traditions are not ranked: Western common practice, maqām (in a 24-tone approximation, flagged), the 72 Karnatic mēḷakarta,
Euclidean rhythms of many traditions, and any equal division of the octave stand side by side.

The tests are
`node tests/lib_music.js` (90 assertions: published reference values M1–M19 of the research, the edge cases and their codes, the
checker, the adapter with its sounds, the Worker, speed) and `node tests/enginelib.js` (the golden outputs of the former Python twin on
`tests/fixtures/enginelib/music.json`, 25 specs). The reference activity is `tools/activities_examples/meantone-wolf`. The research
is in the project's `engine-library/research/arts.md`.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "music@1",
  "params": [ { "id": "fr", "kind": "slider", "label": "fraction", "min": 0, "max": 0.5, "step": 0.01, "default": 0 } ],
  "model": {
    "tuning": { "system": "meantone", "fraction": "fr", "layout": "keyboard", "chainStart": "Eb" },
    "sets": [ { "id": "triad", "notes": ["C4", "E4", "G4"] } ],
    "timbres": [ { "id": "organ", "kind": "harmonic", "n": 6, "decay": 0.7 } ] },
  "outputs": [
    { "id": "third", "kind": "scalar", "of": "cents", "from": "C4", "to": "E4" },
    { "id": "kb", "kind": "scene", "of": "keyboard", "set": "triad", "cents": true },
    { "id": "chord", "kind": "sound", "of": "play", "set": "triad", "timbre": "organ", "dur": 2 } ],
  "plots": [ { "kind": "scene", "of": "kb", "title": "kbTitle", "height": 220 }, { "kind": "sound", "of": "chord", "title": "chordTitle", "height": 120 } ] }
```

- **Notation** (the model's own symbols, not words): a pitch is a letter `A–G`, an accidental (`#`, `##`, `###`, `x`, `b`, `bb`,
  `bbb`, `n`), an optional quarter tone (`^` up, `v` down) and an octave `-1…9` (scientific pitch: C4 = MIDI 60, middle C). A pitch
  class is a letter and an accidental (`F#`). An interval is a quality (`P M m A AA AAA d dd ddd`) and a number 1–15, optionally
  descending (`-m2`). A metre is `n/d` (`6/8`), Neo-Riemannian operations a word over `P L R` (≤ 12), a rhythm pattern `x` and `.`.
- Every number may be a **numx** (a number or an expression over the spec's names). Pitch names are not expressions: to move a
  pitch with a slider, use a set of `midi` numbers (`"midi": ["60 + k"]`). `exprs(spec)` lists the numx with their paths;
  `keys(spec)` is empty (music@1 labels its scenes with numbers and notation symbols only).
- **Limits**: ≤ 24 sets of ≤ 24 notes, 8 progressions of ≤ 32 chords of 2–6 voices, 8 rhythms of ≤ 64 steps, 8 timbres of ≤ 64
  partials; series ≤ 2000 values, scenes ≤ 2000 items, a sound ≤ 512 notes within 60 s and 20 Hz – 20 kHz. A run never throws.

### 1.1 The tuning (`model.tuning`)

| `system` | the frequencies | source |
|---|---|---|
| `12tet` (default) | 2^(1/12) | ISO 16:1975, A4 = `a4` (default 440 Hz) |
| `pythagorean`, `meantone` (`fraction` of the syntonic comma, default ¼) | a regular temperament of fifth F: tone W = 2F − 1200, diatonic semitone h = 3600 − 5F, chromatic semitone A1 = 7F − 4800 | Barbour 1951; Sethares 2005 ch. 4 |
| `layout: spelled` (default) / `keyboard` | spelled: every spelling its own pitch (G♯ ≠ A♭); keyboard: 12 keys from `chainStart` (default E♭) through 11 fifths, the leftover fifth is the **wolf** | Barbour 1951 |
| `just` | 5-limit ratios 1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8 on the `tonic` | Zarlino 1558 |
| `werckmeister3`, `vallotti`, `kirnberger3` | the circulating temperaments on C (Werckmeister III: four fifths ¼ PC narrow; Vallotti: six fifths ⅙ PC; Kirnberger III: four fifths ¼ SC and a schisma) | Barbour 1951 |
| `edo` (`edo` 5–311) | n equal steps; spellings mapped through the best fifth (19-EDO tells C♯ from D♭) | Sethares 2005 |
| `cents` | 12 values above the `tonic` | the author's |

### 1.2 Sets, progressions, rhythms, timbres

- A **set** has exactly one of `notes` (spelled; `transpose` by an interval name), `midi` (numbers, may be fractional: spelled from
  A♭…C♯) or `pcs` (pitch classes 0–11).
- A **progression** has `key`, `mode` (`major`, `minor`) and `chords`: lists of pitches, every chord with the same voices, from the
  top down (soprano first).
- A **rhythm** has `k` and `n` (the Euclidean rhythm E(k, n), Bjorklund 2003 / Toussaint 2005) or a `pattern`, and `rot`.
- A **timbre** has a `kind`: `harmonic` (`n`, `decay`: a_k = decay^(k−1)), `saw`, `square`, `triangle`, `string` (`pluck` point,
  inharmonicity `B`), `closed` (odd harmonics), `bar` (free–free: 1, 2.756, 5.404, …), `membrane` (ideal: 1, 1.594, 2.136, …),
  `custom` (`ratios`, `amps`).

### 1.3 Checker codes (`checkSpec`)

| code | when |
|---|---|
| `value` | a missing or wrong field; a pitch, pitch class, interval, metre, P/L/R word or pattern that does not parse; a set with none or two of `notes`, `midi`, `pcs`; a rhythm without `k`, `n` or a pattern; a custom timbre with unequal lists; `edo` / `cents` missing for their systems; `freq`/`midi` without a note, `play` without exactly one of set/progression/rhythm, a scene without what it draws |
| `enum` | a system, kind, field, model or scale name that is not one of the list |
| `size` | a list too long or too short; chords of a progression with different numbers of voices |
| `duplicate` | an id used twice among sets, progressions, rhythms, timbres |
| `ref` | an output naming an unknown set, progression, rhythm or timbre |
| `output` | an `of` that music@1 does not compute |
| `unused` (warning) | `transpose` on a set that is not `notes` |

**Runtime codes** (`run(...).codes`): `invalid` (NaN; an EDO below 5 steps), `approx` (a maqām scale in 24-TET; a quarter tone
in an EDO that has none; an interval of quality beyond AAAA), `edo-mapping` (an EDO whose fifth gives no proper diatonic scale),
`no-chord`, `no-triad` (P/L/R need a major or minor triad), `out-of-range` (no Forte number below 3 or above 9 notes; a MIDI
number outside 0–127), `unplayable` (a note outside 20 Hz – 20 kHz, left out of the sound).

## 2. Outputs

### Scalars

| `of` | fields | value |
|---|---|---|
| `freq`, `midi` | `note`, or `set` + `i` | Hz in the tuning; the MIDI number (quarter tones .5) |
| `cents` | `from`, `to` | the interval in cents in the tuning |
| `ratioCents`, `monzo`, `comma` | `ratio`; `monzo` (exponents of 2 3 5 7 11 13); `name` (`syntonic`, `pythagorean`, `schisma`, `diaschisma`, `diesis`, `greaterDiesis`, `kleisma`, `septimal`, `holdrian`) | cents |
| `interval` | `from`, `to`, `field`: `number`, `simple`, `quality` (P 0, M 1, m −1, A 2, d −2, AA 3, dd −3, …), `semitones`, `cents`, `direction`, `compound`, `invNumber`, `invQuality`, `ic` | the field |
| `chord` | `set`, `field`: `root` (pc), `quality` (index in the chord table: 0 maj, 1 min, 2 dim, 3 aug, 6 dom7, 11 dim7, …), `inversion`, `bass`, `figure` (53, 63, 64; 7, 65, 43, 42), `candidates` | the best reading (tertian, root in the bass first) |
| `roman` | `set`, `key`, `mode`, `field`: `degree` 1–7, `alter` (♭II: −1), `quality` (augmented sixths: 100 Italian, 101 French, 102 German), `inversion`, `secondary` (V/x: the degree x), `figure` | the Roman numeral as numbers |
| `pcset` | `set`, `field`: `card`, `prime` (Forte's prime form as a 12-bit mask), `rahnPrime`, `differs` (1 for the six classes where they differ), `forte` (the number in Forte's list), `z` (1 if Z-related), `iv1`…`iv6`, `invariance` (T/I maps to itself), `complement` (its Forte number) | Forte 1973; Rahn 1980; the table is music21's (BSD-3) |
| `nrt` | `set` (a triad), `ops`, `field`: `root`, `mode` (1 major, 0 minor) | Cohn 1998 |
| `beats` | `a`, `b`, `p`, `q` | \|p·f(a) − q·f(b)\| Hz: the beats of the p-th and q-th partials |
| `roughness` | `set`, `timbre`, `model` (`sethares`: min-amplitude; `sethares93`: product; `vassilakis`) | Plomp & Levelt 1965 as parametrised by Sethares 1993; Vassilakis 2001 |
| `partial` | `timbre`, `note`, `k` | Hz of the k-th partial |
| `tuning` | `pc` 0–11, `field` (`cents`, `dev` from 12-TET) | the tuning's degree above the tonic (above C for the circulating temperaments) |
| `edo` | `n`, `ratio`, `field` (`steps`, `cents`, `error`) | the best approximation of a ratio in n-EDO |
| `scale` | `name`, `i`, `field` (`size`, `cents` in the tuning, `semitones`) | 20 scales and modes (major … double harmonic, chromatic) and the maqāmāt `rast`, `bayati`, `hijaz`, `saba`, `sikah` (24-TET, `approx`) |
| `melakarta` | `n` 1–72, `i` 0–6 | the svara in semitones (Venkatamakhi's scheme; Sambamoorthy) |
| `rhythm`, `onset` | `rhythm`, `field` (`onsets`, `length`, `necklace`: the smallest rotation as a number, `evenness`); `i` | Toussaint 2005 |
| `duration` | `value` (of a whole note: 0.25 a quarter), `dots`, `tuplet` in `tupletIn`, `bpm`, `beat` (default 0.25) | ms |
| `meter` | `meter`, `field` (`beats`, `beatUnit`, `compound`, `bar`) | 6/8: 2 compound beats of 3/8 |
| `vl` | `progression`, `rule` (`parallel5`, `parallel8`, `contrary` (antiparallels), `hidden`, `crossing`, `overlap`, `spacing`, `range` (SATB: C4–G5, G3–D5, C3–G4, E2–C4), `leadingTone`, `all`) | the number of findings (Fux 1725; Aldwell & Schachter) |
| `resonator` | `type` (`string`: `L`, `tension`, `mu`, `B`; `open`, `closed`: `L`, `r` (end correction 0.6133 r), `tempC`; `bar`, `membrane`: `f1`), `k` | Hz of the k-th mode (Fletcher & Rossing 1998) |

### Series (`part: x | y`)

`dissonance` (two copies of a timbre, the ratio `from`–`to`: the dissonance curve, Sethares 2005 ch. 6), `spectrum`, `waveform`
(one period), `tuning` (`part: dev` the deviations from 12-TET), `scale`, `rhythm`, `harmonics` (the harmonic series of a note).

### Scenes

`keyboard` (`set`, `from`, `to`, `cents`: the deviation of each pressed key from 12-TET), `staff` (`set` or `progression`, `clef`:
`treble`, `bass`, `grand`; parallel fifths and octaves drawn as red lines), `clock` (a set's pitch classes or a rhythm on a circle),
`circle` (the circle of fifths), `tonnetz` (Euler's Tonnetz: fifths across, major thirds up).

### Sound (`kind: "sound"`, plotted with `{"kind": "sound", "of": …}`)

`play` (`set` as a chord or `mode: arpeggio`, a `progression` chord by chord, or a `rhythm` as clicks at `bpm`; `timbre`, `dur`):
`{notes: [{f, t, d, g}], wave?, partials?}` — frequency, start, duration (s), gain. A harmonic timbre is sent as `partials` (the
amplitudes of harmonics 1…32, for a WebAudio PeriodicWave) and one note per pitch; an inharmonic one as one note per partial. The
engine only writes the notes: the page plays them on the main thread, after a tap (browsers allow sound only after a gesture).

## 3. What is left out, and why

- No audio analysis (pitch detection, spectra of recordings) and no score import (MusicXML, MIDI files): they need the microphone
  or files, and belong in an html-app@1.
- Maqām intervals are a 24-TET approximation (`approx`); the real intervals vary by region and performer, which a course should
  say. Śruti tunings (22 divisions) are possible through `cents` or `edo`.
- Roman numeral analysis reads one chord at a time in a given key; it does not find keys or modulations.
- IntCal-like large data are not needed; the only embedded table is Forte's list of 208 set classes (music21, BSD-3-Clause).

## Uses the kernel

No duplicated facility (no time loop of its own beyond the score, no randomness, no root finding): nothing to move (checked 2026-11-07).
