# Where everything went: the new frame, control by control

The redesign (engine/shell.js, engine/src/95_shell.css, the views in engine/src/40_views.js) keeps every function of the
older screens. The ones you use every day stay on the page. The rest move into a **⋮** menu (top right), a **▾** menu next
to the button they belong to, or appear only where they are needed. This file maps each of the 528 controls of the older
screens (the survey ids in the left column: T = top bar, H = subject home, C = chapter, S = section, …) to its new home.
Dialogs whose inside did not change are one row ("unchanged; opened from …").

With `shell: false` in `config.js` the older screens are still there (classic top bar, subject picker at start); the older
test suites run that way. `tests/shell.js` checks the new homes.

## The frame
| Place | What is there |
|---|---|
| **Tabs** (bottom on phones, a rail on the left from 760 px) | Today · Knowledge · Languages (only if chosen) · Discover · Progress |
| **Top bar** | ← back · crumbs (where you are; tap a crumb to go there) · the page's own buttons · **⋮** · 🔔 · **Me** (your emoji, with the sync dot) |
| **The character** (bottom right) | Ask the tutor. Full body on navigation pages, a small face while you read or practise |
| **Share bar** (under the top bar) | Pending shares, invitations and updates: Accept / Join / Reject / Update / Keep mine / Later |
| Phones | The top bar slides away while you read and comes back after a deliberate scroll up |

## 1. Top bar of a subject (T1–T14), banners (B1–B11), 🔔 (N1–N7)
| Old | New home |
|---|---|
| T1 brand | Today tab; on wide screens the character at the top of the rail |
| T2 subject chip ▾ (switch subject) | ⋮ › Choose a subject (on Today, a subject, the Shelf: "All subjects"); Today › Continue elsewhere |
| T3 🧭 Map | Crumbs (Roadmap › subject) and ←; the subject page's "Station of …" line; subject ⋮ › Open the map |
| T4 🧭 Curricula | Knowledge tab |
| T5 🌍 Explore | Discover › What others share; Shelf ⋮ |
| T6 ⏱️ Focus sprint (was hidden on phones) | ⋮ › Focus sprint on Today, the subject, a chapter, a section; while it runs, a small clock next to ⋮ (tap to stop) |
| T7 ⭐ XP, T8 🔥 streak | Today (goal ring, streak line) and the Progress tab (level, XP, the week) |
| T9 📚 Sources | ⋮ › Sources (subject, chapter, section) |
| T10 🌓 theme (was hidden on phones) | Me › Language & appearance › Light / dark |
| T11 🔔 | 🔔 in the top bar (a sheet instead of a modal) |
| T12 🦉 Tutor | The character button |
| T13 account chip, T14 sync dot | Me (top right on phones, foot of the rail on wide screens), with the sync dot |
| B1–B5 share / update banners | The share bar under the top bar (same buttons) and 🔔 |
| B6–B8 setup banner | Unchanged, on the subject page during the first sessions |
| B9–B10 source filter banner | Unchanged, on every page while a filter is on |
| B11 step banner (🗺️ Map) | The subject page's one header: a small "Station of …" line above the title (opens the map), the bar counts the station's mastery |
| N1–N7 🔔 contents | Unchanged rows, in a sheet |

## 2. A subject (`#/subject`, was `#/`)
| Old | New home |
|---|---|
| H1 ▶ Continue / Start chapter 1 | The primary button on the subject page; also Today's big Continue card (across subjects) |
| H2 ✨ What's new | Button on the subject page when there is something new; subject ⋮ › What's new |
| H3 daily-goal ring | Today |
| H4 🔎 jump to a concept | ⋮ › Search this subject (subject, chapter, section) |
| H5 ⚡ Lightning, H6 🔧 Debug drills, H7 🃏 Flashcards, H8 🔁 Mistakes gym, H9 🎲 Mixed, H10 🦉 tutor tile | **Practice ▾** next to Continue (with the "due" counts); Today › Review / Mistakes gym across subjects |
| H11 chapter cards | Chapters as **cards** (default) or as a **list**: the Cards / List switch, remembered |
| — (was in ⚙️ › Subjects or the picker) | Subject ⋮: Put it on a map / Another station, Edit, Share or make public, Export the package, Choose a subject, Reset my progress |

## 3. A chapter (`#/ch/<id>`): Theory · Practice · Traps
| Old | New home |
|---|---|
| C1 ← All chapters | ← and the crumbs; ⋮ › All chapters |
| C2 source chips, C3 ring, C4 mantra + 💡 | Unchanged |
| C5 📖 Learn tab | Theory tab |
| C6 🎯 Practice tab (filters) | Practice tab › Choose what to practise (`#/ch/<id>/filters`, same filters) |
| C7 🔧 Debug-drills tab | Practice tab › Debug drills (`#/ch/<id>/debug` still works) |
| C8 🃏 Cards tab | Practice tab › Flashcards (`#/ch/<id>/cards` still works) |
| C9 ⚠️ Traps tab | Traps tab (kept as its own tab) |
| C10 objectives, C11 sections | Theory tab, unchanged |
| C12 🎯 Practice this chapter | Theory tab: Start reading / Continue (the next unread section), then Practise the chapter; Practice tab › A round of 10 |
| C13 👾 Boss battle | Practice tab › The chapter's boss |
| C14 🦉 Socratic review | Theory tab (quiet button), Practice tab, chapter ⋮ |
| C15–C20 filters and Start round | Practice › Choose what to practise (unchanged) |
| C21–C22 drills | Practice › Debug drills (unchanged) |
| C23 ⚠️ Start trap drill | Traps tab › Traps, no timer; new: ⚡ True or false against the clock (`#/lightning/<chapter>`) |
| C24 pitfalls + 💡 | Traps tab, unchanged |
| — | New in Practice: Mistakes of this chapter (when there are some) |

## 4. A section (`#/s/<id>`), reading mode
| Old | New home |
|---|---|
| S1 ← chapter | ← and the crumbs; ⋮ › All sections of the chapter |
| S2–S12 reading, 💡, copy, reveal, recall, figures | Unchanged (the top bar hides while you read on phones). A lesson opens at its top. 💡 never covers a block's own buttons: on a picture it sits next to ⤢, on a question set next to its switch. A picture whose parts have labels starts with them **hidden**; "👀 Show labels" sits on top of it |
| S13 🦉 Socratic dialogue, S14 🔧 Debug simulation, S15 🎤 Interview me | The tutor's mode list (Socratic, Explain, Quiz, Interview, Case simulation); section ⋮ › Socratic dialogue on this |
| S16 ⚡ Quick check, S17 section drill | Unchanged, after the section |
| S18 🎯 All N exercises | A quiet button after the section |
| S19 ✨ Fresh AI question | Section ⋮ › A new question (the card appears at the end of the section) |
| S20 ← previous, S21 next → | One big **Next section →** (with the next title; across chapters too), Practise the chapter next to it when the chapter ends, ← Previous section small below; after the very last section: Practise the chapter → |

## 5. Exercises, pictures, runs, flashcards, drills, what's new, sources, viewer (E, V, P, F, D, W, SD, FV)
Unchanged, except "Ask <character>" on an exercise: it waits in the card's top corner and shows while you are on the card (always, faintly, on touch screens). Their pages get crumbs and ← in the top bar instead of a "← Home" button (P6, P13, P15, F1, D1, W1), and runs,
drills and the Lightning round are in reading mode. The run summary, the daily goal, a new level, a beaten boss, a
mastered station and the last 5 seconds of a timed round can bring a big reaction of the character (at most one every
3 minutes, milestones always; Me › Language & appearance › How much game: playful / calm / off).

## 6. The tutor (TU1–TU20, CV1–CV9)
| Old | New home |
|---|---|
| The tutor button | The character itself, whole, animated and with its name, bottom right on every page (also before any subject is open: the last subject studied loads quietly behind it) |
| TU1 🕘 history, TU2 ⬇️ export, TU3 ↺ new conversation, 🗣 conversation language | The tutor's ⋮ (Back to the conversation while the history is open; Export once there is a conversation); Me › Conversations opens the history |
| Mode chips | One list under "How <character> helps you": each mode with its line ("Socratic · I ask you until you find it yourself") |
| Context chip, "use whole course" | A "For: …" chip; its ✕ goes back to the whole subject |
| Model label | Me › <character> and AI |
| Starter buttons | A greeting from the character for the mode and the topic |
| everything else | Unchanged (the threads tracker and "Saved to your lessons" show only when there are some); the sheet rises from the bottom on phones |

## 7. Account menu (A, AP, AS, ASu, AB, AC, AH) → **Me**
| Old | New home |
|---|---|
| A1 header (XP, streak) | Me (name, kind) and Progress |
| A3 tabs | Me's list: Character · Profile · AI · Language & appearance · Conversations · My subjects · Data and sync · Help, and Switch profile |
| AP1–AP9 Profile | Me › Profile (unchanged form, incl. "show the subject picker every time", PIN, delete profile) |
| AS1–AS16 Gemini, Claude, AI conversations' language | Me › AI |
| AS17 theme, AS18 daily goal, AS19 menus' language, AS20 sound, AS21 bite-size reading | Me › Language & appearance (+ How much game) |
| AS22 backup of this subject | Me › Data and sync |
| AS23 Reset this subject's progress | Subject ⋮ › Reset my progress |
| ASu1–ASu8 Subjects | Me › My subjects (unchanged), and each subject's ⋮ on the Shelf |
| AB1–AB10 Backup & restore, AC1–AC13 Cloud | Me › Data and sync (cloud first, then backup and restore) |
| AH1–AH11 Help | Me › Help (unchanged guides) |
| — | Me › Character: the gallery of 20 characters in three folded groups (pet friends and fruits · fairy tales · serious; the same groups at first start), "Try for 5 minutes", a new one every 15 days (or fixed by an organisation: `config.js` `character`, `lockCharacter`). Characters from fairy tales keep their tale's name in every language |
| — | Me › What I learn: Knowledge / Languages / Both (shows or hides the Languages tab) |

## 8. Before a subject: accounts, picker, Shelf, Explore, sharing, Claude (PA, SP, SH, SC, ES, SS, EX, CG, CS)
| Old | New home |
|---|---|
| PA1–PA13 profiles, PIN, cloud sign-in, in-use card, Connect Claude | Unchanged; Switch profile is in Me and in Today ⋮ |
| — first start | Two questions once: what you learn (Knowledge / Languages / Both) and who comes with you (the character) |
| SP subject picker at start | Today opens instead; the picker stays one tap away (⋮ › Choose a subject) and can come back at every start (Me › Profile) |
| SP1, SP3–SP6 curricula in the picker | Knowledge tab (Roadmaps, + New Roadmap, ⋮ › Import a map / Roadmaps others share) |
| SP2 shared-with-you rows | The share bar and 🔔 |
| SP7–SP9, SH1–SH4, SC1 the Shelf and its chips | Knowledge › 📚 Shelf (a quiet link under the Roadmaps): a list with search; tap to study |
| SC2 ✏️, SC3 🔗, SC4 🧭 | Each subject's ⋮ on the Shelf: Study · Put it on a map · Edit · Share · Export the package |
| SP10 ✨ Create with Claude | Discover; Shelf ⋮ |
| SP11 🌍 Explore | Discover; Shelf ⋮. A page (`#/explore/subjects`), in folded sections by domain like the Roadmaps |
| SP12 📥 Import subject pack | Discover › Import a file; Shelf ⋮ (now .zip too) |
| SP13 👤 Switch profile | Me; Today ⋮ |
| ES, SS, EX, CG, CS dialogs | Unchanged; opened from the places above, Discover › Your Claude app, Me › AI |

## 9. Roadmaps (curricula) (CL, XC, SCu, NC, BP, IM, MP, MB, ST, AT, RC, MS, AP-, NU, PT, SU)
| Old | New home |
|---|---|
| CL1 ➕ New curriculum | Knowledge › + New Roadmap; Knowledge ⋮; Discover; Today ⋮ |
| CL2 📥 Import a map | Knowledge ⋮; Discover |
| CL3 🌍 Explore curricula | Knowledge ⋮ › Roadmaps others share; Discover. A page (`#/explore`): the public Roadmaps in folded sections by domain; typing in the search shows only the results |
| CL4 invitations | Top of the Knowledge tab, and the share bar |
| CL5 curriculum card | Roadmap card on Knowledge (progress bar); tap opens the map, or the build progress |
| CL6 👥 on the card | The card's ⋮ › Share (also: Open the map, Settings, Export .json) |
| CL7 📚 Shelf | Knowledge › 📚 Shelf |
| MP map overlay | **A page** (`#/map/<id>`): stations grow upwards to the treasure, your character waits at the next one; Map / List switch (remembered) |
| MP1 ← Curricula, MP9 ✕ | ← and the crumbs |
| MP3 −, + and MP4 ⤢ Fit | Wide screens: unchanged. Phones: the map fits the screen width |
| MP5 ▶ Next up | Unchanged |
| MP6 ➕ Step, MP7 👥, MP8 ⚙️ | The map's ⋮: Add a step · Share · Settings (also Your Claude app, Export .json) |
| MP12 legend | The map's ⋮ › What the signs mean (a sheet) |
| MB1–MB6 bars | Unchanged, above the map |
| MB "for your Claude app" bar | Gone from the map: a dot on the map's ⋮ while steps wait for material and you have never sent them to the Claude app; ⋮ › Copy the message for Claude |
| ST1–ST24 station panel | A bottom sheet on phones. 📎 next to the title opens your material (its line is the tooltip); the path (Path C › Foundations) is a quiet subtitle next to the kind of step; the file name and pages are no longer under the title. "I already know this" first explains the test (Proceed / Go back). "Use a subject I have" and "Detach" are in Edit step, which shows only fields you can change |
| everything else in §6 (NC, BP, IM, SCu, AT, RC, MS, AP-, NU, PT, SU) | Unchanged dialogs, opened from the places above |

## 10. Keyboard and gestures
Unchanged, plus: Esc closes a ⋮ menu or a sheet; ↑ / ↓ move inside a ⋮ menu.

## Wording and icons
The interface says **Roadmap** (el Οδικός χάρτης, ru дорожная карта, fr parcours) wherever it meant a curriculum or its map; "Map" stays only for the picture of a Roadmap (the Map / List switch). The new frame shows line icons, not emoji: dialogs of the older screens, the Roadmap page and the toasts drop their pictographs when shown inside it (`Noema.plain`). Subjects and chapters keep the icon their pack gives them. Progress counts one item per completed chapter (every section read), drawn so that no two overlap.
