# `timeline@1` — chronology in every calendar (`engine/src/48_lib_timeline.js`, `NoemaLibTimeline`)

A general engine of the library (`docs/INTERACTIVE_LIBRARY.md`) for dates and time spans: events and periods on one time axis, in
33 calendars and eras, none of them "the" calendar. Any era can be the main axis of the picture (the Hijri years, the Hebrew years,
the Olympiads, years BP). Dates can be uncertain (circa, a range, a terminus post or ante quem, a radiocarbon age), and the engine
answers with numbers: a converted date's fields, durations, the probability of each of Allen's 13 relations, statistics of a dating,
Easter, regnal years, tree-ring cross-dating. Every limit of validity is a **code**, never a silently wrong date.

The Python twin is `tools/lib_timeline.py`: it checks and does not compute, and it embeds the same JSON tables. The tests are
`node tests/lib_timeline.js` (84 assertions: published reference values, comparisons with ICU on thousands of days, the codes, the
adapter, the Worker, speed) and `node tests/enginelib.js` (JS ↔ Python parity on `tests/fixtures/enginelib/timeline.json`, 26
specs). The reference activity is `tools/activities_examples/calendar-synchronism`. The research behind this chapter is in the
project's `engine-library/research/arts.md`.

## 1. The spec

```json
{ "format": "noema.sim-spec/v1", "engine": "timeline@1",
  "params": [ { "id": "yb", "kind": "slider", "label": "yearBce", "min": 1, "max": 800, "step": 1, "default": 480 } ],
  "model": {
    "options": { "auc": "varro", "olympiadMonth": 7 },
    "events": [ { "id": "battle", "date": { "cal": "julian", "era": "bce", "y": "yb", "m": 9, "d": 22 }, "label": "evBattle" } ],
    "periods": [ { "id": "wars", "start": { "cal": "julian", "era": "bce", "y": 499 }, "end": { "cal": "julian", "era": "bce", "y": 449, "m": 12, "d": 31 } } ],
    "axis": { "era": "olympiad", "bceKey": "bce" } },
  "outputs": [
    { "id": "ol", "kind": "scalar", "of": "convert", "event": "battle", "to": "olympiad", "field": "ol" },
    { "id": "in", "kind": "scalar", "of": "relation", "a": "battle", "b": "wars", "rel": "during" },
    { "id": "chart", "kind": "scene", "of": "timeline" } ] }
```

- Every number of a date may be a **numx**: a number or an expression over the spec's names, compiled once. `exprs(spec)` lists
  them with their paths. `keys(spec)` lists the string keys the model names (event and period `label`, `axis.bceKey`, `axis.ceKey`):
  the words are in the activity's strings, never in the engine.
- **Internally** every day is a Rata Die number (RD 1 = Monday 1 January 1 CE, proleptic Gregorian; Reingold & Dershowitz), and
  JDN = RD + 1 721 425. Years are astronomical (1 BCE = year 0) unless a date names `era: "bce"`.
- **Limits**: ≤ 200 events, 100 periods, 50 reigns; a model curve or a tree-ring series ≤ 2000 / 3000 values; `mc` (Monte Carlo
  draws for relations and statistics) 500–50 000, seeded (the same seed gives the same numbers). A run never throws.

### 1.1 Dates

`{cal, y, m, d, era?, leap?, lc?, ol?, oy?, j?}` — the fields each calendar needs (an unused field is a warning):

| calendars | fields |
|---|---|
| `gregorian`, `julian`, `civil` (Julian before the region's reform, Gregorian after), `roc`, `thai`, `buddhist`, `dangun`, `juche`, `holocene`, `auc`, `byzantine`, `spanish` | `y` (+ `m`, `d`, `era: bce/ce` for the first three) |
| `hebrew`, `islamic`, `umalqura`, `persian`, `coptic`, `ethiopic`, `bahai`, `french`, `saka`, `hindusolar`, `nabonassar` | `y`, `m`, `d` |
| `chinese`, `dangi` | `y`, `m`, `d`, `leap` (a leap month) |
| `japanese` | `era` (`meiji`, `taisho`, `showa`, `heisei`, `reiwa`), `y` (+ `m`, `d`) |
| `maya` | `lc`: the five Long Count digits |
| `olympiad` | `ol`, `oy` (1–4) |
| `jdn` | `j` |
| `vikram`, `seleucid`, `bp`, `b2k` | `y` |

`model.options`: `maya` (the correlation constant, default 584283 GMT), `auc` (`varro` 753, `cato` 752, `polybius` 751, `fabius` 748
BCE), `islamic` (the arithmetic leap scheme I–IV), `islamicEpoch` (`civil` or `astronomical`), `region` (when `civil` switched:
`rome` 1582 … `britain` 1752, `sweden` with its 1700–1712 detour and 30 February 1712, `russia` 1918, `greece` 1923; 13 regions),
`olympiadMonth` (the month the Olympic year begins, default 7), `seleucid` (`macedonian` autumn 312 or `babylonian` spring 311 BCE).

### 1.2 Events, periods, reigns

- An **event** has exactly one of `date` (with `sd`/`sdYears` for a normal uncertainty or `pm`/`pmYears` for a uniform ± range),
  `between` (two dates, uniform), `after` / `before` (a terminus, open up to `horizonYears`, default 100), `c14` (`age`, `sd` in
  radiocarbon years, `curve: linear | model`, `reservoir` ± `reservoirSd`). `label` is a string key, `lane` 0–9 its row.
- A **period** has `start` and `end` (dates).
- A **reign** has `start` and `mode`: `anniversary` (years from the accession day), `accession` (the accession year is year 1)
  or `nonaccession` (the rest of the year is year 0, the next new year — `newYearM`, `newYearD` — begins year 1).
- `c14curve`: `{calBP, age, sd}` — an author-supplied calibration curve (increasing calBP). **IntCal20 is not built in**: its site
  states no licence for redistribution, so the engine calibrates with a linear curve (age = calBP, for teaching the method) or
  with the curve segment the author types in from the published table. A course that needs real calibrated dates must say so.
- `dendro`: `master` and `sample` ring widths (or `synthetic: {n, len, offset, noise}`, a seeded AR(1) series), `masterStart`,
  `minOverlap`.
- `axis`: `era` (any calendar: the ticks are labelled in its years), `from`, `to`, `bceKey`, `ceKey`.

### 1.3 Checker codes (`checkSpec`, the same in `tools/lib_timeline.py`)

| code | when |
|---|---|
| `value` | a missing or wrong field; a date without the fields its calendar needs; an event with none or two kinds of date; dendro without data |
| `enum` | a calendar, era, option, relation or field name that is not one of the list; a `convert` field the target calendar has not |
| `year-zero` | `y: 0` with an `era` (there is no year 0 BCE or CE) |
| `duplicate` | an id used twice among events, periods and reigns |
| `ref` | an output naming an unknown event, period or reign; a model curve without `model.c14curve`; crossdate without `model.dendro` |
| `size` | `c14curve` lists of different lengths |
| `output` | an `of` that timeline@1 does not compute |
| `unused` (warning) | a field the calendar or the kind of event does not use |

### 1.4 Runtime codes (`run(...).codes`, and the scalar output `flag`)

`proleptic` (a calendar used before it existed: Gregorian before 1582, Julian before 45 BCE), `julian-error` (45 BCE – 8 CE, when
Rome's leap years were misapplied: the proleptic date may be off by a few days), `nonexistent` (a day skipped by a reform in that
region, such as 10 September 1752 in Britain: NaN), `out-of-range` (outside a table: Chinese and Korean 1900–2100, Umm al-Qura
1300–1600 AH, Bahá'í 172–221 BE, Japanese eras from 1873), `approx` (a rule-based calendar that the real one only approximates: the
old Hindu solar, Vikram, the Swedish calendar of 1700–1712), `post-bomb` (a radiocarbon fraction above 1), `invalid` (a value
that cannot be computed: NaN).

## 2. Calendars and their sources

| calendar | rule | source and test |
|---|---|---|
| Gregorian, Julian, JDN | floor formulas, every astronomical year | Meeus 1998 ch. 7; Fliegel & Van Flandern 1968; round trips over 8 700 years |
| civil + 13 regions | the reform dates and skipped days | Britain 2→14 Sep 1752 (355-day year), Russia 31 Jan → 14 Feb 1918, Sweden 30 Feb 1712 |
| Hebrew | molad, the four dehiyyot | R&D ch. 8; ICU on thousands of days; Rosh Hashanah 5785–5787, Passover 5786 |
| Islamic (arithmetic, I–IV) | 30-year cycle | R&D ch. 7; ICU islamic-civil |
| Umm al-Qura | month table 1300–1600 AH (ICU 78) | ICU islamic-umalqura |
| Solar Hijri (Persian) | Borkowski's algorithm for the astronomical (vernal-equinox) rule | Borkowski 1996; ICU persian; 1404 AP |
| Coptic, Ethiopic | 13 months; Ethiopic also Amete Alem | R&D ch. 4; ICU |
| Bahá'í (Badí') | Naw-Rúz from the March equinox at Tehran sunset, table 172–221 BE | Meeus ch. 27; the Bahá'í World Centre dates 2024–2031 |
| French Republican | the years I–XIV as observed (the autumn equinox at Paris), Romme's rule after | R&D ch. 17 |
| Indian national (Śaka) | 1 Caitra = 22 (21) March | ICU indian |
| old Hindu solar (Ārya-siddhānta) | mean sidereal year | R&D ch. 10; flagged `approx` |
| Chinese, Korean (Dangi) | month table 1900–2100 (ICU 78), leap months, stems and branches | ICU chinese, dangi; the sexagenary day cycle |
| Japanese eras | Meiji…Reiwa on the Gregorian calendar | era starts (1868/1873, 1912, 1926, 1989, 2019) |
| Minguo (ROC), Thai, Buddhist Era, Dangun, Juche, Holocene, BP, b2k, Spanish era, Byzantine (with indiction), Seleucid, Vikram | year offsets on a base calendar | ICU roc from 1912; definitions |
| Olympiads, AUC, Nabonassar | year counts with their epochs and new-year days | Ptolemy's Nabonassar (26 Feb 747 BCE); Varro and the alternatives |
| Maya | Long Count, Tzolk'in, Haab', Lord of the Night, Calendar Round | GMT 584283 (or 584285): Pakal's birth 9.12.11.5.18 = 26 Aug 683 Julian |
| Roman (output only) | Kalends, Nones, Ides, the bissextile day | `ref`, `count`, `month`, `bis` |

## 3. Outputs

### Scalars

| `of` | fields | value |
|---|---|---|
| `convert` | `event`, `to` (a calendar or `roman`), `field` (one of that calendar's fields), `at` (`median`, `mean`, `lo95`, `hi95` for an uncertain event) | the field: `y`, `m`, `d`, `weekday`, `leap`, `yearLength`, `monthLength`, … (Chinese `stem`, `branch`, `cycle`; Maya `b k tun w kin`, `tzNum`, `haabMonth`, …) |
| `duration` | `a`, `b`, `unit` (`days`, `years` of 365.25 days, `calendarYears`), `inclusive` | b − a |
| `relation` | `a`, `b` (events or periods), `rel` (Allen's 13) | the probability (0–1) over `mc` seeded draws; 0 or 1 for exact dates |
| `within` | `event`, `from`, `to` | the probability that the event falls in the window |
| `stat` | `event`, `stat` (`mean`, `median`, `sd`, `lo68`, `hi68`, `lo95`, `hi95`: the highest-density intervals), `unit` (`year`, `bp`, `jdn`) | the statistic |
| `c14age` | `F` (fraction modern), `Fsd`, `year` (the measurement), `field` (`age`, `sd`, `age5730`, `d14c`, `F`) | the conventional radiocarbon age (Libby half-life 5568 a; Stuiver & Polach 1977) |
| `easter` | `year`, `rite` (`western`, `orthodox`), `field` (`month`, `day`, `jdn`, `julianMonth`, `julianDay`) | Meeus ch. 8 (Gregorian) and the Julian computus |
| `gap` | `year` | days between the Gregorian and Julian calendars (11 in 1700, 13 in 2026) |
| `crossdate` | `field` (`lag`, `year`, `t`, `r`, `glk`, `n`) | the best match of the sample on the master (Baillie & Pilcher 1973 t-value; Gleichläufigkeit) |
| `regnal` | `reign`, `event` | the regnal year of the event |
| `flag` | `event`, `flag` | 1 if the event's date carries that runtime code |

### Series and the scene

- `density` (`event`, `part: x | y`, `unit`): the probability density of an uncertain or calibrated date.
- `crossdate` (`part`): t-value against the lag; `c14curve` (`part: x | y | sd`): the model curve.
- **Scene** `timeline` (`era`, `from`, `to`): the axis with ticks in the chosen era, events as points (with their uncertainty
  bars), periods as bars, one lane per `lane`. Labels are the string keys of the model; numbers are `v`.

## 4. What is left out, and why

- **IntCal20 / SHCal20 / Marine20** are not embedded (no redistribution licence stated): calibration uses a linear or an
  author-supplied curve, flagged in the docs and the course.
- Observational calendars (the sighted Islamic month, the modern Hindu lunisolar pañcāṅga, the Chinese calendar outside 1900–2100)
  are not computed: they depend on local sighting or astronomical software; the table ranges are `out-of-range`.
- Egyptian regnal chronology and the Sothic cycle are left to the author's events and reigns: there is no agreed absolute table.
