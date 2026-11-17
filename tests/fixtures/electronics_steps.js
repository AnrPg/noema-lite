/* Steps 2 and 3 of the learner's Roadmap “Build your own gadgets: electronics, microcontrollers, embedded & IoT” (cg4tmvvv8) as
   noema_roadmap_map showed them on 2026-11-17 (refs and titles exact; both prepared) — the case of noema_add_roadmap_chapters. */
const ch = (ref, title) => ({ ref, title, goals: [`Teach ${title}`], coverage: [`${title}: the essentials`] });
const step2 = {
  id: 'capacitors_inductors_ac_and_filters', title: 'Capacitors, inductors, AC and filters', role: 'foundation', learningGoals: ['Analyse RC, RL and RLC circuits'],
  chapters: [ch('capacitor_ode', 'The capacitor as an ODE and as stored energy'), ch('inductor_ode', 'The inductor as an ODE and as stored energy'), ch('rc_rl_transients', 'RC and RL transients and time constants'),
    ch('rlc_resonance_damping', 'RLC circuits: oscillation, damping and resonance'), ch('ac_phasors_impedance', 'AC, phasors and complex impedance'), ch('transfer_functions_bode', 'Transfer functions and Bode plots'),
    ch('passive_filters', 'Passive filters: RC, RL, LC and design'), ch('oscilloscope_basics', 'Oscilloscope basics and measurement artefacts'), ch('ac_synthesis_problems', 'Integrated problems and common traps')],
  plannedAt: '2026-11-10T10:00:00.000Z', pack: { id: 'cur-g4tmvv-capacitors-inductors', status: 'ready' },
};
const step3 = {
  id: 'real_components_and_analog_switching', title: 'Real components and analog switching', role: 'intro', learningGoals: ['Choose and drive real components'],
  chapters: [ch('real_r_c_l', 'Non-idealities of resistors, capacitors and inductors'), ch('diodes_leds_zener', 'Diodes, LEDs and Zener diodes'), ch('bjt_switching', 'The BJT as a switch and amplifier'),
    ch('mosfet_switching', 'The MOSFET as a switch: low-side, high-side, gate drive'), ch('inductive_loads_flyback', 'Inductive loads and flyback protection'), ch('opamps_basics', 'Op-amps: ideal rules and real limits'),
    ch('relays_ssr_opto', 'Relays, SSRs and optocouplers'), ch('datasheets_schematics', 'Reading datasheets and schematics')],
  plannedAt: '2026-11-10T10:00:00.000Z', pack: { id: 'cur-g4tmvv-real-components', status: 'ready' },
};
const add2 = { chapters: [{ ref: 'transformers_coupled', title: 'Transformers and coupled inductors', goals: ['Explain mutual inductance and the turns ratio'], coverage: ['mutual inductance', 'ideal and real transformers'], after: 'inductor_ode' }] };
const add3 = { chapters: [
  { ref: 'semiconductor_physics', title: 'Semiconductor physics: bands, doping and the pn junction', goals: ['Explain bands, doping and the pn junction'], coverage: ['energy bands', 'doping', 'the pn junction'], before: 'diodes_leds_zener' },
  { ref: 'advanced_devices', title: 'Advanced device behaviour: BJT, MOSFET physics, breakdown, SOA and wide-bandgap', goals: ['Judge device limits'], coverage: ['breakdown', 'SOA', 'SiC and GaN'], after: 'mosfet_switching' }] };
const ORDER2 = ['capacitor_ode', 'inductor_ode', 'transformers_coupled', 'rc_rl_transients', 'rlc_resonance_damping', 'ac_phasors_impedance', 'transfer_functions_bode', 'passive_filters', 'oscilloscope_basics', 'ac_synthesis_problems'];
const ORDER3 = ['real_r_c_l', 'semiconductor_physics', 'diodes_leds_zener', 'bjt_switching', 'mosfet_switching', 'advanced_devices', 'inductive_loads_flyback', 'opamps_basics', 'relays_ssr_opto', 'datasheets_schematics'];
module.exports = { step2, step3, add2, add3, ORDER2, ORDER3 };
