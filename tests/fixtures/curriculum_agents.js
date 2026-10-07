/* Scripted answers of the four curriculum agents (goal: Bayesian inference) — used by tests/curriculum.js. */
const F = ['prob_basics', 'conditional_probability', 'random_variables', 'distributions', 'likelihood', 'calculus_basics', 'philosophy_of_induction'];
const T = { prob_basics: 'Probability basics', conditional_probability: 'Conditional probability', random_variables: 'Random variables', distributions: 'Probability distributions', likelihood: 'Likelihood', calculus_basics: 'Calculus basics', philosophy_of_induction: 'The problem of induction', bayesian_inference: 'Bayesian inference', medical_testing: 'Diagnostic testing in medicine', spam_filtering: 'Spam filtering', ab_testing: 'A/B testing in product decisions' };
const edges = [['prob_basics', 'conditional_probability'], ['prob_basics', 'random_variables'], ['random_variables', 'distributions'], ['calculus_basics', 'distributions'], ['distributions', 'likelihood'], ['conditional_probability', 'bayesian_inference'], ['likelihood', 'bayesian_inference'], ['philosophy_of_induction', 'bayesian_inference'], ['bayesian_inference', 'medical_testing'], ['bayesian_inference', 'spam_filtering'], ['bayesian_inference', 'ab_testing']];
function dag({ broken = false } = {}) {
  const role = r => r === 'bayesian_inference' ? 'goal' : ['medical_testing', 'spam_filtering', 'ab_testing'].includes(r) ? 'application' : 'foundation';
  return { schemaVersion: 1, stage: 'dag_creator', goalRef: 'bayesian_inference', applicationRefs: ['medical_testing', 'spam_filtering', 'ab_testing'],
    nodes: Object.keys(T).map(r => ({ ref: r, title: T[r], summary: 'What ' + T[r] + ' is and why it matters.', role: role(r), knowledgeDomains: [r === 'philosophy_of_induction' ? 'Philosophy' : 'Mathematics'] })),
    edges: edges.filter(e => !(broken && e[0] === 'philosophy_of_induction')).map(([a, b]) => ({ fromRef: a, toRef: b, rationale: `${T[a]} is needed for ${T[b]}.` })),
    bottlenecks: [{ nodeRef: 'conditional_probability', explanation: 'Everything Bayesian is conditioning.' }],
    minimalLearningPath: ['prob_basics', 'conditional_probability', 'bayesian_inference'], deepLearningPath: ['philosophy_of_induction', 'prob_basics', 'calculus_basics', 'random_variables', 'distributions', 'likelihood', 'conditional_probability', 'bayesian_inference', 'medical_testing'],
    mastery: Object.keys(T).map(r => ({ nodeRef: r, knowledgeDomain: 'information', processingLevels: ['retrieval', 'comprehension', 'analysis'] })) };
}
const audit = () => ({ schemaVersion: 1, stage: 'prerequisite_auditor', added: [{ ref: 'sets_and_events', title: 'Sets and events', summary: 'Set operations that probability is built on.', knowledgeDomains: ['Mathematics'], knowledgeDomain: 'information', processingLevels: ['retrieval', 'comprehension'], why: 'Probability axioms are statements about sets.' }],
  edges: [{ fromRef: 'sets_and_events', toRef: 'prob_basics', rationale: 'Events are sets.' }], notes: ['Checked the probability, calculus and philosophy routes.'] });
const expand = () => ({ schemaVersion: 1, stage: 'goal_expander', goalId: 'bayesian_inference', expectedGoalTitle: 'Bayesian inference', introductionTitle: 'Introduction to Bayesian inference',
  aspects: [{ ref: 'g_priors', title: 'Prior distributions', coverage: 'Choosing and justifying priors.', atomic: false }, { ref: 'g_posterior', title: 'Posterior analysis', coverage: 'From prior and likelihood to the posterior.', atomic: false },
    { ref: 'g_computation', title: 'Bayesian computation', coverage: 'Computing posteriors in practice.', atomic: false }, { ref: 'g_model_checking', title: 'Model checking', coverage: 'Posterior predictive checks.', atomic: true }],
  subtopics: [['g_priors_conjugate', 'Conjugate priors', 'g_priors'], ['g_priors_informative', 'Informative and weak priors', 'g_priors'], ['g_posterior_updating', 'Sequential updating', 'g_posterior'], ['g_posterior_credible', 'Credible intervals', 'g_posterior'],
    ['g_computation_mcmc', 'Markov chain Monte Carlo', 'g_computation'], ['g_computation_vi', 'Variational inference', 'g_computation'], ['g_computation_diagnostics', 'Convergence diagnostics', 'g_computation']].map(([ref, title, aspectRef]) => ({ ref, title, coverage: title + ' in depth.', aspectRef })),
  relatedTopics: [{ ref: 'g_rel_frequentist', title: 'Frequentist contrasts', parentRef: 'introduction' }], synthesisRef: 'goal_synthesis', synthesisTitle: 'Bayesian inference: synthesis & mastery',
  coveragePlan: ['Priors, posteriors, computation and checking cover the full workflow.'], internalEdges: [{ fromRef: 'g_computation_mcmc', toRef: 'g_computation_diagnostics' }] });
function plans(ids) {
  return { schemaVersion: 1, stage: 'chapter_planner', plans: ids.map(id => ({ nodeId: id, learningGoals: [`Explain ${id}`, `Apply ${id} to a new problem`],
    chapters: ['Why it matters', 'Core definitions', 'Worked examples', 'Pitfalls and transfer'].map((t, i) => ({ ref: 'c' + (i + 1), title: `${t} (${id})`, teachingGoals: ['You can ' + t.toLowerCase()], requiredCoverage: [t + ' of ' + id] })) })) };
}
const test = () => ({ questions: Array.from({ length: 10 }, (_, i) => ({ q: `Question ${i + 1}: which is right?`, options: ['The right answer', 'A tempting wrong one', 'Another wrong one'], answer: 0, explain: 'Because it is right.' })) });

/** A chapter in noema-lite's own format, as Gemini would write it (valid for packcheck strict + packgen.quality). */
function chapter(num, title, { broken = false } = {}) {
  const id = 'ch' + String(num).padStart(2, '0'); const s = k => `${id}-s0${k}`; let e = 0; const E = o => ({ id: `${id}-e${String(++e).padStart(3, '0')}`, difficulty: 1, tags: ['concept'], explain: 'Because… and the tempting answer is wrong because…', ...o });
  const ex = [];
  for (const k of [1, 2, 3]) ex.push(
    E({ type: 'mcq', section: s(k), q: 'Which is true?', options: ['A', 'B', 'C'], answer: 0, tags: ['exam'] }),
    E({ type: 'tf', section: s(k), q: 'Priors can be updated.', answer: true }),
    E({ type: 'cloze', section: s(k), text: 'The [[posterior]] combines prior and likelihood.', tags: ['pitfall'] }),
    E({ type: k === 1 ? 'order' : k === 2 ? 'match' : 'bucket', section: s(k), q: 'Arrange', ...(k === 1 ? { items: ['Prior', 'Data', 'Posterior'] } : k === 2 ? { pairs: [['Prior', 'before data'], ['Likelihood', 'data given θ'], ['Posterior', 'after data']] } : { buckets: ['Bayesian', 'Frequentist'], items: [{ text: 'Credible interval', bucket: 0 }, { text: 'p-value', bucket: 1 }, { text: 'Prior', bucket: 0 }] }) }));
  ex.push(E({ type: 'odd', section: s(1), q: 'Which does not belong?', options: ['Prior', 'Posterior', 'Likelihood', 'Hammer'], answer: 3 }),
    E({ type: 'scenario', section: s(2), q: 'Your chain does not converge.', tags: ['debug'], steps: [{ prompt: 'First check?', options: [{ text: 'Trace plots', ok: true, fb: 'Yes' }, { text: 'Buy a GPU', ok: false, fb: 'No' }] }] }),
    E({ type: 'free', section: s(3), q: 'Explain Bayes’ rule in your words.', model: 'Posterior ∝ likelihood × prior.', rubric: ['likelihood', 'prior'] }));
  if (!broken) ex.push(E({ type: 'img_hotspot', section: s(1), media: 'workflow', answer: ['posterior'], q: 'Click the posterior.' }), E({ type: 'img_sequence', section: s(2), media: 'workflow', answer: ['prior', 'data', 'posterior'], q: 'Trace the update.' }), E({ type: 'img_drag', section: s(3), media: 'workflow', q: 'Drag the labels.', tags: ['exam'] }));
  const blocks = [{ t: 'p', text: 'Bayes in one line.' }, { t: 'callout', kind: 'key', title: 'Key', text: 'Posterior ∝ likelihood × prior.' }, { t: 'reveal', label: 'Think first: why?', text: 'Because data updates beliefs.' }];
  return { id, num, title, subtitle: 'A step of the curriculum', emoji: '📈', mantra: 'Beliefs are updated by evidence.', objectives: ['You can explain it', 'You can apply it', 'You can check it'],
    sections: [1, 2, 3].map(k => ({ id: s(k), title: 'Section ' + k, hook: 'Why care', blocks: k === 1 ? [...blocks, { t: 'figure', media: 'workflow' }] : blocks })),
    debug: [{ id: `${id}-d01`, title: 'Chain does not converge', section: s(2), symptom: 'R-hat > 1.1', askYourself: ['Did I run long enough?', 'Is the step size sane?', 'Is the model identifiable?'], steps: [{ do: 'Plot traces', why: 'See mixing' }], rootCauses: ['Too short'], fix: 'Run longer' }],
    pitfalls: [{ title: 'Prior = posterior', text: 'Mixing them up.', fix: 'Remember the data step.' }],
    flashcards: Array.from({ length: 8 }, (_, i) => ({ q: 'Card ' + (i + 1), a: 'Answer', section: s(1 + (i % 3)) })),
    exercises: ex,
    diagrams: [{ id: 'workflow', kind: 'flow', title: 'The Bayesian update', alt: 'Prior, then data, then posterior', caption: 'Prior × likelihood → posterior', items: [{ id: 'prior', label: 'Prior', note: 'Belief before data' }, { id: 'data', label: 'Data / likelihood', note: 'Evidence' }, { id: 'posterior', label: 'Posterior', note: 'Belief after data' }] }] };
}
module.exports = { dag, audit, expand, plans, test, chapter, T };
