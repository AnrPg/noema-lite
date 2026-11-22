/* What each engine of the catalogue (src/engines/catalog.ts) is for, one line in English: the deep audit (audit.ts) prints it
   next to the id of every engine it suggests for a chapter ("seq@1 — DNA, RNA and proteins: …"). Word for word the engine
   catalogue's engine.engines.<slug>.what (the #/engines page; i18n/engine/en.arb), which tests/audit.js checks. It lives here, in
   the content checks' piece, so the app's first script does not carry it. */
export const ENGINE_PURPOSE: Readonly<Record<string, string>> = Object.freeze({
  'formula@1': 'Any relation written as formulas: values, curves, sliders.',
  'ode@1': 'Systems that change in time: growth, oscillations, epidemics, kinetics, chaos.',
  'prob@1': 'Distributions, sampling, tests and intervals, Bayes, Markov chains, simulations.',
  'logic@1': 'Propositional, first-order, modal, deontic, epistemic and temporal logic; proofs, SAT, argumentation.',
  'graph@1': 'Graphs and networks: paths, trees, flows, matchings, colourings, centrality.',
  'geom@1': 'Constructions, triangle centres, conics, transformations, loci, measures.',
  'genetics@1': 'Crosses, pedigrees, linkage, populations: drift, selection, mutation, migration.',
  'seq@1': 'DNA, RNA and proteins: translation, reading frames, alignment, primers, restriction maps.',
  'med@1': 'The body as a system: circulation, breathing, acid–base, kidneys, drug levels and dosing.',
  'clinic@1': 'Virtual patients: history, examination, tests, differential diagnosis, probabilities, decisions.',
  'anatomy@1': 'Structures and their links: nerves, vessels, muscles, joints, lesions and what they cause.',
  'timeline@1': 'Events and periods in any calendar: Gregorian, Julian, Hebrew, Islamic, Persian, Chinese, Maya and more.',
  'music@1': 'Notes, intervals, scales, chords, tunings, rhythm and the sound of the harmonic series.',
  'map@1': 'Projections, distances and routes on the globe, journeys and territories in time.',
  'text@1': 'Word counts, concordances, style and authorship, metre and scansion of verse.',
  'craft@1': 'Knitting, weaving, quilting, embroidery, sewing, woodwork, pottery, metal and leather: the numbers and the patterns.',
  'law@1':
    'Statutes as rules with exceptions, arguments and proof standards, precedents, deadlines, contracts and damages, crimes and sentences, proportionality, voting, citations, inheritance.',
  'agents@1':
    'Crowds and agent-based models, networks and epidemics, and multi-agent systems: BDI agents, messages, auctions, contracts, norms.',
  'field@1': 'Heat, diffusion, waves, reaction–diffusion and cellular automata on 1-D and 2-D grids, with stability checks.',
  'des@1': 'Discrete-event simulation: arrivals, servers, routing, breakdowns and shifts, with confidence intervals.',
  'philo@1':
    'Ethics calculi, voting and social choice, decisions and games, knowledge and vagueness, thought experiments and a map of thinkers.',
  'rhetoric@1': 'Debate rounds and judging, argument maps and fallacies, figures of speech and the delivery of a speech.',
  'circuit-mna@1': 'Exact circuit simulation with instruments and hidden faults.',
  'thermal@1': 'Heat flow, heatsinks and thermostats.',
  'pid@1': 'Feedback loops and PID controllers to tune.',
  'rf@1': 'Antennas, path loss and link budgets.',
  'twin@1': 'A battery-powered sensor device: energy, timing, faults.',
  'html-app@1': 'A small app written for this activity: games, puzzles, anything an engine cannot do.',
  'py-module@1': 'A Python program run in the browser, with NumPy and SciPy.',
  'wasm@1': 'Fast simulations compiled to WebAssembly.',
});
