# The Socratic tutor — elicitation threads that always close

**Problem:** a pure Socratic loop answers questions with questions; the learner never knows whether they were right,
nested questions pile up, and the conversation never culminates in knowledge.

**Design:** the *app* (not the model) owns a small state machine of **threads**.

| Concept | Rule |
|---|---|
| Thread | one question the learner is working out (opened by the tutor, or a learner question it chose to elicit) |
| Direct answer vs. elicit | facts, definitions, numbers, syntax, side questions, “just tell me”, ≥2 failed tries, or 2 threads already open → **answer directly**; elicit only what can be reasoned out in 1–3 steps |
| Verdict | every learner answer gets ✅ / 🟡 / ❌ + why — never ambiguity |
| Budget | **3 attempts** per thread (`THREAD_BUDGET`); then the app instructs the model to resolve it in that reply |
| Nesting | at most **2 open threads** (main + one sub-question); after a sub-thread: “Back to: …” |
| Closure | every thread ends with **✅ Answer** (authoritative, complete) + **📌 Lesson** (one sentence) |
| Culmination | no open threads → **🎓 What you learned** (all lessons) + one optional next step, instead of a new chain; after 10 learner turns the app asks the model to converge |
| Learner controls | **💡 Just tell me** (resolve the focus thread now) and **🎓 Wrap up** (resolve everything + summary) in the tracker bar |

**Mechanics (engine/src/65_threads.js):**
1. Before each call the app counts an attempt on the focus thread and appends a **TUTOR STATE** block to the system prompt:
   open threads (tree, attempts/budget, focus), lessons so far, learner turn count, and computed **DIRECTIVES**
   (resolve now / don’t open new threads / converge / wrap up).
2. The model ends every reply with a hidden control line:
   `<noema-state>{"opened":[…],"resolved":[{"id","answer","lesson"}],"lesson":…,"focus":…,"verdict":…,"summary":…}</noema-state>`
   — stripped from the display while streaming, parsed when complete, stored as `meta.noemaState` on the message.
3. The app merges it into `tutorState` (hard caps enforced even if the model misbehaves; resolving a parent closes its children;
   a missing control line triggers a reminder directive on the next turn).
4. `tutorState` is saved with the conversation (IndexedDB, folder, cloud, backups, SQLite) and the lessons appear
   in the tracker, as chips under the reply, and at the top of every Markdown export.


## 💡 Explain this (any part of a lesson)
Every block of a section (paragraph, list, table, figure, callout, comparison…), its cards and items (comparison
columns, terms, longer list points, table rows), the section heading, the chapter's mental model and every trap get a
small 💡 in their top corner — visible on hover (faint but always there on touch screens). It opens the tutor dock in
**💡 Explain** mode with the context `item`: the part itself first (`FOCUS`), then its section and the chapter
(`WIDER CONTEXT`), so the explanation is about exactly that part but may connect to the rest of the lesson and go
beyond it. The conversation is saved like any other (context type `item`, with its section).
