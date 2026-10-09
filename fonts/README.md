# Self-hosted web fonts

These are self-hosted copies of Google Fonts, so the app (the site and every page served from this repository) never depends on fonts.googleapis.com at runtime. The one exception is the one-file bundle (`python3 tools/build.py bundle`): a single HTML file cannot reasonably carry these 6.9 MB, so it links the same families from Google Fonts when it is online, as it did before this folder existed, and uses the system fonts offline. They were fetched as woff2 from the Google Fonts CSS2 API (Chrome User-Agent), keeping only the subsets latin, latin-ext, greek, greek-ext, cyrillic and cyrillic-ext that each family has; variable families were requested as a weight range (one `<subset>-var.woff2` per subset covers all weights in it), static families per weight. `fonts.css` holds the `@font-face` rules with the original weights and `unicode-range`, `fonts.json` the per-family metadata, and each `<slug>/LICENSE.txt` the licence from the google/fonts repository (M PLUS Rounded 1c: from its upstream repo coz-m/MPLUS_FONTS). Total 48 families, 6.9 MB. A "no" under Greek or Cyrillic means the family has no glyphs for that script, so the app needs a fallback font for that language.

| Family | Licence | Weights | Greek | Cyrillic | Source |
|---|---|---|---|---|---|
| Alegreya | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Alegreya) |
| Alegreya Sans | OFL-1.1 | 400, 500, 700, 800 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Alegreya+Sans) |
| EB Garamond | OFL-1.1 | 600 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/EB+Garamond) |
| Literata | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Literata) |
| M PLUS Rounded 1c | OFL-1.1 | 400, 500, 700, 800 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) |
| Zen Antique | OFL-1.1 | 400 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Zen+Antique) |
| Murecho | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Murecho) |
| Oranienbaum | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Oranienbaum) |
| Tektur | OFL-1.1 | 600 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Tektur) |
| Geologica | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Geologica) |
| Brygada 1918 | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Brygada+1918) |
| Commissioner | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Commissioner) |
| Kelly Slab | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Kelly+Slab) |
| Playpen Sans | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Playpen+Sans) |
| Zen Maru Gothic | OFL-1.1 | 400, 500, 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Zen+Maru+Gothic) |
| Pangolin | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Pangolin) |
| Alegreya SC | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Alegreya+SC) |
| Gentium Book Plus | OFL-1.1 | 400, 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Gentium+Book+Plus) |
| Ruslan Display | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Ruslan+Display) |
| Mynerve | OFL-1.1 | 400 | yes | no | [Google Fonts](https://fonts.google.com/specimen/Mynerve) |
| Ysabeau | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Ysabeau) |
| Neucha | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Neucha) |
| Dela Gothic One | OFL-1.1 | 400 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Dela+Gothic+One) |
| Ubuntu | UFL-1.0 | 400, 500, 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Ubuntu) |
| Russo One | OFL-1.1 | 400 | no | yes | [Google Fonts](https://fonts.google.com/specimen/Russo+One) |
| Ysabeau Infant | OFL-1.1 | 800 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Ysabeau+Infant) |
| Comfortaa | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Comfortaa) |
| Vollkorn | OFL-1.1 | 800 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Vollkorn) |
| Source Sans 3 | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Source+Sans+3) |
| Noto Serif Display | OFL-1.1 | 600, 700 italic | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Noto+Serif+Display) |
| Manrope | OFL-1.1 | 400–800 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Manrope) |
| Piazzolla | OFL-1.1 | 700 italic | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Piazzolla) |
| Fira Sans | OFL-1.1 | 400, 600, 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Fira+Sans) |
| Sofia Sans Extra Condensed | OFL-1.1 | 800 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Sofia+Sans+Extra+Condensed) |
| IBM Plex Sans | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/IBM+Plex+Sans) |
| Roboto Slab | Apache-2.0 | 600 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Roboto+Slab) |
| Inter Tight | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Inter+Tight) |
| Comic Relief | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Comic+Relief) |
| Jura | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Jura) |
| Inter | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Inter) |
| Noto Sans | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Noto+Sans) |
| JetBrains Mono | OFL-1.1 | 400–800 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/JetBrains+Mono) |
| Source Serif 4 | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Source+Serif+4) |
| Old Standard TT | OFL-1.1 | 400, 700, 400 italic | no | yes | [Google Fonts](https://fonts.google.com/specimen/Old+Standard+TT) |
| Noto Serif | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Noto+Serif) |
| Fira Code | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Fira+Code) |
| STIX Two Text | OFL-1.1 | 400–700 (variable) | yes | yes | [Google Fonts](https://fonts.google.com/specimen/STIX+Two+Text) |
| Fira Sans Condensed | OFL-1.1 | 700 | yes | yes | [Google Fonts](https://fonts.google.com/specimen/Fira+Sans+Condensed) |
