/* noema-lite — 🧭 Curricula UI: library · new curriculum (agents' progress) · the map (DAG in three parts) ·
   node panel (learning goals, chapters, prerequisites, study / prepare / "I already know this").
   Logic lives in engine/curriculum.js; this file only draws. Works before the engine starts (subject picker)
   and inside it (topbar 🧭), on computers and phones. docs/CURRICULUM.md */
window.NoemaCurMap = (() => {
  const C = () => window.NoemaCurriculum, G = () => window.NoemaCurriculum.Gen, LLM = () => window.NoemaLLM;
  const el = (...a) => window.Noema.el(...a);
  const overlay = (b, o) => window.Noema.overlay(b, o);
  const toast = (m, ms) => window.Noema.toast?.(m, ms);
  const head = (t, sub) => el('div', { class: 'noema-ovhead' }, el('div', {}, el('h1', {}, t), sub ? el('p', { class: 'muted' }, sub) : null));
  const tip = (...t) => el('details', { class: 'cg-tip' }, el('summary', { title: 'More info', 'aria-label': 'More info' }, 'i'), el('div', { class: 'cg-tipbody' }, ...t));
  // 🔓 is unreadable at badge size (looks like 🔒), so open steps get a drawn green padlock with its shackle swung open
  const OPEN_SVG = '<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true" style="vertical-align:-0.2em"><path d="M7 11V7a5 5 0 0 1 9.9-1" fill="none" stroke="#16a34a" stroke-width="3" stroke-linecap="round"/><rect x="3" y="11" width="18" height="11" rx="2.5" fill="#16a34a"/></svg>';
  const openIc = () => el('span', { class: 'cm-openic', title: 'Open', html: OPEN_SVG });
  const ICON = { foundation: '🧱', intro: '🚪', aspect: '🎯', subtopic: '🔹', related: '🔗', synthesis: '🏁', application: '🚀', goal: '🎯' };
  const ROLE = { foundation: 'Prerequisite', intro: 'Introduction to the goal', aspect: 'Major aspect of the goal', subtopic: 'Sub-topic', related: 'Related topic', synthesis: 'Synthesis & mastery', application: 'Application', goal: 'Goal' };
  const fmtPct = x => Math.round((x || 0) * 100) + '%';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

  /* ======================= library ======================= */
  function library(acc, { onStudy } = {}) {
    return overlay((box, close) => {
      box.classList.add('cm-lib');
      const draw = () => {
        box.innerHTML = '';
        const list = C().list(acc);
        box.append(head('🧭 Roadmaps', 'Type a goal; Claude or Gemini lays out everything you need — prerequisites → the goal → applications — and prepares each step as a full subject.'),
          el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => { close(); create(acc, { onStudy }); } }, '➕ New Roadmap'), el('button', { class: 'btn', onclick: () => { close(); importMap(acc, { onStudy }); } }, '📥 Import a Roadmap'),
            el('button', { class: 'btn cm-explorebtn', title: 'Roadmaps other learners share — join one and prepare its steps together', onclick: () => { close(); exploreCurricula(acc, { onStudy }); } }, '🌍 Explore Roadmaps'),
            el('span', { class: 'tiny' }, 'Each step (node) becomes a subject with theory, exercises, flashcards, drills and the tutor.')),
          invBox,
          list.length ? el('div', { class: 'cm-cards' }, ...list.map(c => {
            const s = c.status === 'ready' ? C().summary(acc, c) : null;
            const sh = c.shared && !c.shared.ended ? c.shared : null;
            const card = el('button', { class: 'cm-card', onclick: () => { close(); c.status === 'ready' || c.status === 'attach' ? map(acc, c.id, { onStudy }) : progress(acc, c, { onStudy }); } },
              el('div', { class: 'cm-cardtop' }, el('span', { class: 'cm-emo' }, sh ? '👥' : '🧭'), el('b', {}, c.title || c.goal)),
              sh ? el('div', { class: 'tiny cm-sharedby' }, sh.role === 'member' ? `👥 shared by ${sh.ownerName || 'its owner'}` : `👥 you share it${sh.public ? ' · 🌍 public' : ''}`) : null,
              s ? el('div', { class: 'cm-bar' }, el('i', { style: { width: fmtPct(s.pct) } })) : null,
              el('div', { class: 'tiny' }, s ? `${s.mastered}/${s.total} mastered · ${s.open} open · ${s.ready} prepared` + (sh ? ` · ${Object.values(c.remote || {}).filter(x => x.status === 'ready').length} shared` : '') + (window.NoemaCurJobs && !J().work(c).done ? ' · 💬 waiting for your Claude app' : '') : c.status === 'attach' ? '📦 attach the subjects you have, then its steps are planned — tap' : c.status === 'waiting' ? '💬 waiting for your Claude app — tap' : c.status === 'building' ? '⏳ being built…' : c.status === 'paused' ? '⏸️ paused — tap to continue' : '⚠️ stopped — tap to continue'));
            const canShare = !(c.shared?.role === 'member') && Object.keys(c.nodes || {}).length;
            return el('div', { class: 'cm-cardwrap' }, card, canShare ? el('button', { class: 'btn small ghost cm-sharebtn', title: sh ? 'Sharing: members, public, invitations' : 'Share this Roadmap — everybody keeps their own progress, the prepared steps are shared', 'aria-label': 'Share ' + (c.title || c.goal), onclick: e => { e.stopPropagation(); shareCurriculum(acc, c.id, { onDone: draw }); } }, '👥') : null);
          })) : el('div', { class: 'empty' }, el('div', { class: 'e' }, '🧭'), el('p', {}, 'No Roadmap yet. Tap ➕ New Roadmap and type what you want to master.')),
          el('div', { class: 'row noema-ovfoot' }, shelfBtn, el('button', { class: 'btn small', onclick: close }, 'Close')));
      };
      // 📚 the Shelf: the subjects that are on no step of a map (engine/loader.js) — reachable, but not in the way
      const shelfBtn = el('button', { class: 'btn small ghost cm-shelflink', title: 'Subjects that are not on a step of any Roadmap — study them, or put them on a Roadmap', onclick: () => { close(); window.Noema.openShelf?.(acc, { onStudy }); } }, '📚 Shelf');
      window.Noema.shelf?.(acc).then(l => { shelfBtn.textContent = `📚 Shelf (${l.length})`; }).catch(() => { });
      // 📬 invitations to curricula other people share (cloud accounts)
      const invBox = el('div', { class: 'cm-invites' });
      const drawInv = async () => {
        invBox.innerHTML = ''; if (!cloudOn(acc) || !SH()) return;
        const inv = await SH().invites().catch(() => []); if (!inv.length) return;
        invBox.append(el('div', { class: 'nx-lbl' }, `📬 ${inv.length} curricul${inv.length === 1 ? 'um' : 'a'} shared with you`), ...inv.map(i => inviteRow(acc, i, { onJoined: c => { close(); map(acc, c.id, { onStudy }); }, onDone: drawInv })));
      };
      draw(); drawInv(); const off = C().onChange(() => { if (box.isConnected) draw(); else off(); });
      window.NoemaCurJobs?.App.start(acc); G().start(acc);
    });
  }

  /* ======================= 👥 shared curricula (engine/curshare.js, docs/CURRICULUM.md §8) ======================= */
  const SH = () => window.NoemaCurShare;
  const SHARE_RULES = 'Everybody keeps their own progress. The prepared steps are shared: anybody in the Roadmap may prepare a step nobody has prepared yet (with their own AI), and everybody gets it. Nobody can overwrite a step someone else prepared.';
  const when = t => t ? new Date(t).toLocaleDateString() : '';
  /** An invitation: who shares what, Join / No thanks. */
  function inviteRow(acc, i, { onJoined, onDone } = {}) {
    return el('div', { class: 'nx-req cm-invite' },
      el('div', { class: 'grow' }, el('b', {}, i.owner_name || 'Someone'), ' invites you to the Roadmap ', el('b', {}, `“${i.title}”`),
        el('div', { class: 'tiny' }, [`${i.meta?.counts?.steps || '?'} steps`, i.language ? '🗣️ ' + i.language : '', i.message ? `“${i.message}”` : ''].filter(Boolean).join(' · '))),
      el('button', { class: 'btn small primary', onclick: async e => { e.currentTarget.disabled = true; try { const c = await SH().join(acc, i.curriculum); toast(`👥 You joined “${c.title || c.goal}” — your progress is your own; the prepared steps are shared.`, 5000); onJoined?.(c); } catch (er) { toast('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, '✓ Join'),
      el('button', { class: 'btn small', onclick: async () => { await SH().decline(i.curriculum).catch(er => toast('⚠️ ' + er.message)); toast('No thanks — the invitation is gone'); onDone?.(); } }, '✕ No thanks'));
  }
  /** 👥 Share one of my curricula: public, with people, members, stop. */
  function shareCurriculum(acc, cid, { onDone } = {}) {
    overlay((box, close) => {
      box.classList.add('cm-sharedlg');
      const log = el('div', { class: 'tiny cm-sharelog', 'aria-live': 'polite' });
      const say = m => { log.textContent = m; };
      const busy = async (btn, fn) => { if (btn) btn.disabled = true; try { await fn(); } catch (e) { say('⚠️ ' + e.message); } if (btn && btn.isConnected) btn.disabled = false; draw(); onDone?.(); };
      const draw = async () => {
        const c = C().get(acc, cid); if (!c) { close(); return; }
        box.innerHTML = '';
        box.append(head(`👥 Share “${c.title || c.goal}”`, SHARE_RULES));
        if (!cloudOn(acc)) { box.append(el('p', { class: 'cg-warn' }, '☁️ Sharing needs a noema-lite cloud account (⚙️ → Cloud) — for you and for the people you share with.'), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close'))); return; }
        const sh = c.shared && !c.shared.ended ? c.shared : null;
        const mine = Object.values(c.nodes).filter(n => n.pack?.status === 'ready' && !n.pack.shared).length;
        if (!sh) {
          const inc = el('input', { type: 'checkbox' }); inc.checked = true;
          const files = Object.keys(c.files || {}).length;
          box.append(el('div', { class: 'nx-sec' },
            mine ? el('label', { class: 'tiny' }, inc, ` Include the ${mine} step${mine === 1 ? '' : 's'} you prepared already (everybody gets them)`) : null,
            files ? el('p', { class: 'tiny' }, `📎 Its ${files} file${files === 1 ? '' : 's'} (your material) go with it, so the others can prepare the steps taught from them.`) : null,
            el('div', { class: 'row' },
              el('button', { class: 'btn primary cm-sharepublic', onclick: e => busy(e.currentTarget, () => SH().publish(acc, cid, { isPublic: true, steps: inc.checked, onLog: say })) }, '🌍 Make it public'),
              el('button', { class: 'btn cm-sharepeople', onclick: e => busy(e.currentTarget, () => SH().publish(acc, cid, { isPublic: false, steps: inc.checked, onLog: say })) }, '👥 Share with people (by e-mail)')),
            el('p', { class: 'tiny' }, '🌍 Public: anyone finds it in 🧭 Roadmaps → 🌍 Explore Roadmaps and joins. 👥 With people: only those you invite.')), log);
        } else {
          const R = Object.values(c.remote || {}), ready = R.filter(x => x.status === 'ready'), people = new Set(ready.map(x => x.author));
          box.append(el('p', {}, sh.public ? '🌍 Public — anyone can find it in Explore Roadmaps and join.' : '👥 Shared with the people you invite.',
            el('span', { class: 'tiny' }, ` · ${ready.length} of ${Object.keys(c.nodes).length} steps prepared${people.size ? ` by ${people.size} ${people.size === 1 ? 'person' : 'people'}` : ''} · your changes to the Roadmap reach everybody by themselves`)),
            el('div', { class: 'row' }, el('button', { class: 'btn small cm-publictoggle', onclick: e => busy(e.currentTarget, () => SH().setPublic(acc, cid, !sh.public)) }, sh.public ? '🔒 Only invited people' : '🌍 Make it public')));
          const email = el('input', { class: 'noema-input', type: 'email', placeholder: 'their e-mail (the one they sign in with)', 'aria-label': 'E-mail' });
          const msg = el('input', { class: 'noema-input', placeholder: 'A message (optional)', maxlength: '300' });
          box.append(el('div', { class: 'nx-sec' }, el('h4', {}, '📨 Invite someone'), el('div', { class: 'noema-form' }, email, msg,
            el('div', { class: 'row' }, el('button', { class: 'btn primary cm-invitebtn', onclick: e => busy(e.currentTarget, async () => { await SH().invite(acc, cid, email.value, msg.value.trim()); say(`📨 Invited ${email.value.trim()} — they see it in 🔔 and in 🧭 Roadmaps.`); }) }, '📨 Invite')))));
          const mem = el('div', { class: 'cm-members' }, el('p', { class: 'tiny' }, '…'));
          box.append(el('div', { class: 'nx-sec' }, el('h4', {}, '👥 People'), mem));
          SH().members(cid).then(ms => {
            mem.innerHTML = ''; if (!ms.length) { mem.append(el('p', { class: 'tiny' }, 'Nobody yet.')); return; }
            const ic = { pending: '⏳ invited', joined: '✅ joined', rejected: '✖ said no', left: '↩ left', revoked: '⛔ removed' };
            for (const m of ms) mem.append(el('div', { class: 'nx-sentrow' }, el('span', { class: 'grow' }, el('b', {}, m.name || m.email), m.name ? el('span', { class: 'tiny' }, ' ' + m.email) : null, el('span', { class: 'tiny' }, ' · ' + (ic[m.status] || m.status))),
              ['pending', 'joined'].includes(m.status) ? el('button', { class: 'btn small ghost', onclick: e => busy(e.currentTarget, () => SH().removeMember(cid, m.email, { pending: m.status === 'pending' })) }, m.status === 'pending' ? 'Withdraw' : 'Remove') : null));
          }).catch(e => { mem.innerHTML = ''; mem.append(el('p', { class: 'tiny' }, '⚠️ ' + e.message)); });
          box.append(log, el('details', { class: 'cg-faq' }, el('summary', {}, '⏹ Stop sharing'),
            el('p', { class: 'tiny' }, 'The shared steps and files are removed from the shared Roadmap. Everybody keeps their own copy of the Roadmap and the steps they already have, with their progress.'),
            el('button', { class: 'btn small danger cm-stopshare', onclick: e => { if (confirm('Stop sharing this Roadmap?')) busy(e.currentTarget, async () => { await SH().unpublish(acc, cid); say('⏹ No longer shared.'); }); } }, '⏹ Stop sharing')));
        }
        box.append(el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      };
      draw();
    });
  }
  /** 🌍 Curricula other learners made public: join one (or open it, if it is mine / I joined). */
  function exploreCurricula(acc, { onStudy } = {}) {
    overlay((box, close) => {
      box.classList.add('cm-lib');
      const grid = el('div', { class: 'cm-cards' }, el('p', { class: 'tiny' }, '⏳ …'));
      const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 Search public Roadmaps…', oninput: () => drawList() });
      let all = [];
      const drawList = () => {
        grid.innerHTML = ''; const w = q.value.trim().toLowerCase();
        const list = all.filter(x => !w || [x.title, x.description, x.owner_name].join(' ').toLowerCase().includes(w));
        if (!list.length) { grid.append(el('div', { class: 'empty' }, el('div', { class: 'e' }, '🌍'), el('p', {}, all.length ? 'Nothing matches.' : 'No public Roadmaps yet. Share one of yours: 🧭 Roadmaps → 👥 on its card → 🌍 Make it public.'))); return; }
        for (const x of list) {
          const have = C().get(acc, x.id), own = have && !(have.shared?.role === 'member') || (CL()?.session?.()?.user?.id === x.owner);
          grid.append(el('div', { class: 'cm-card cm-pubcard' },
            el('div', { class: 'cm-cardtop' }, el('span', { class: 'cm-emo' }, '🧭'), el('b', {}, x.title)),
            x.description ? el('div', { class: 'tiny' }, x.description) : null,
            el('div', { class: 'tiny' }, [`👤 ${x.owner_name || 'someone'}`, `${x.meta?.counts?.steps || '?'} steps`, `⚡ ${x.prepared || 0} prepared`, x.language ? '🗣️ ' + x.language : '', '🕒 ' + when(x.updated_at)].filter(Boolean).join(' · ')),
            el('div', { class: 'row' }, have ? el('button', { class: 'btn small primary', onclick: () => { close(); map(acc, x.id, { onStudy }); } }, own ? '🗺️ Open — it is yours' : '🗺️ Open — you joined')
              : el('button', { class: 'btn small primary cm-joinbtn', onclick: async e => {
                if (!cloudOn(acc)) { toast('☁️ Joining needs a noema-lite cloud account (⚙️ → Cloud) — your progress is kept there.', 5000); return; }
                e.currentTarget.disabled = true; try { const c = await SH().join(acc, x.id); toast(`👥 You joined “${c.title || c.goal}” — your progress is your own; the prepared steps are shared.`, 5000); close(); map(acc, x.id, { onStudy }); } catch (er) { toast('⚠️ ' + er.message, 5000); e.target.disabled = false; } } }, '➕ Join'))));
        }
      };
      box.append(head('🌍 Explore Roadmaps', 'Roadmaps other learners share. ' + SHARE_RULES), q, grid,
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small ghost', onclick: () => { close(); library(acc, { onStudy }); } }, '← My Roadmaps'), el('button', { class: 'btn small', onclick: close }, 'Close')));
      SH().explore().then(l => { all = l || []; drawList(); }).catch(e => { grid.innerHTML = ''; grid.append(el('p', { class: 'cg-warn' }, '⚠️ ' + e.message)); });
    });
  }
  const CL = () => window.NoemaCloud;
  /** 🔎 the shell's Explore page: the public Roadmaps → [{ id, title, description, domain, owner_name, steps, prepared, language, have, own }] */
  async function publicRoadmaps(acc) {
    return ((await SH().explore()) || []).map(x => { const have = C().get(acc, x.id);
      return { ...x, domain: C().domainOf({ title: x.title, description: x.description, domain: x.meta?.domain }), steps: x.meta?.counts?.steps || 0, prepared: x.prepared || 0,
        have: !!have, own: !!have && have.shared?.role !== 'member' || CL()?.session?.()?.user?.id === x.owner }; });
  }
  /** Open a public Roadmap: its map when it is on this device already, otherwise join it first (that needs a cloud account) */
  async function openPublic(acc, x, { onOpen = id => map(acc, id) } = {}) {
    if (C().get(acc, x.id)) return onOpen(x.id);
    if (!cloudOn(acc)) throw new Error(SL('joinNeedsCloud', 'Joining needs a noema-lite cloud account (Me › Cloud): your progress is kept there.'));
    const c = await SH().join(acc, x.id); toast(SL('joinedRm', `You joined “${c.title || c.goal}”`, { title: c.title || c.goal }), 4000); onOpen(x.id);
  }

  /* ======================= new curriculum ======================= */
  function keysBox(acc, onChange) {
    const wrap = el('div', { class: 'cm-keys' });
    const draw = () => {
      wrap.innerHTML = ''; const a = LLM().available(acc);
      const keyIn = el('input', { class: 'noema-input', type: 'password', placeholder: 'sk-ant-… (Claude API key)', autocomplete: 'off' });
      const st = el('span', { class: 'tiny' });
      wrap.append(
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.claude ? '✅ Claude' : '➖ Claude'), el('span', { class: 'tiny' }, a.claude ? 'API key on this device — best quality (skill, web research, pictures)' : 'no API key on this device'),
          tip('Claude builds the best Roadmaps and subjects (it researches official sources and adds pictures). It uses your Claude API key and costs a few dollars per prepared step; you set a limit per step. Get a key: ✨ Create with Claude → “Here in noema-lite” (steps 1–3).')),
        a.claude ? null : el('div', { class: 'row' }, keyIn, el('button', { class: 'btn small', onclick: async () => { const k = keyIn.value.trim(); if (!window.NoemaClaude.Key.looksValid(k)) { st.textContent = '⚠️ That is not a Claude API key (sk-ant-…).'; return; } st.textContent = '⏳'; try { await window.NoemaClaude.models(k); window.NoemaClaude.Key.set(acc, k, true); draw(); onChange?.(); } catch (e) { st.textContent = '❌ ' + e.message; } } }, 'Use this key'), st),
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.gemini ? '✅ Gemini' : '➖ Gemini'), el('span', { class: 'tiny' }, a.gemini ? 'free key — used when there is no Claude key' : 'no key (⚙️ Settings → Gemini key)'),
          tip('Gemini (free key) builds the Roadmap and the subjects inside the app with Google Search; its subjects have drawn diagrams but no web photos, and the free quota is limited.')));
    };
    draw(); return wrap;
  }
  /* ---------- 💬 the Claude app (the learner's Claude plan) — engine/curjobs.js ---------- */
  const J = () => window.NoemaCurJobs;
  const prefs = acc => { try { return JSON.parse(localStorage.getItem(`noema1:${acc}:a:settings`) || '{}'); } catch (e) { return {}; } };
  const cloudOn = acc => !!(window.NoemaCloud?.session?.() && acc === 'u_' + window.NoemaCloud.session().user.id);
  const copy = async (t, b) => { try { await navigator.clipboard.writeText(t); if (b) { const o = b.textContent; b.textContent = '✓ Copied'; setTimeout(() => { b.textContent = o; }, 1600); } } catch (e) { prompt('Copy this:', t); } };
  /** The AI choice of a new / imported curriculum: the Claude app first (usually the cheapest), then the keys. */
  function providerPick(acc, { what = 'builds the Roadmap and prepares the steps' } = {}) {
    const sel = el('select', { class: 'noema-input cm-provider' }, el('option', { value: 'claudeapp' }, '💬 Claude app — with your Claude plan (recommended, usually cheaper)'), el('option', { value: 'auto' }, 'Automatic (Claude API key if it is here, else Gemini)'), el('option', { value: 'claude' }, 'Claude — API key'), el('option', { value: 'gemini' }, 'Gemini — free key'));
    const pref = prefs(acc).curProvider;   // ⚙️ Settings → Claude → AI for new curricula
    sel.value = pref && [...sel.options].some(o => o.value === pref) ? pref : cloudOn(acc) || !LLM().pick(acc, 'auto') ? 'claudeapp' : 'auto';
    const keys = keysBox(acc);
    const app = el('div', { class: 'cm-appinfo' },
      el('p', {}, el('b', {}, '💬 Your own Claude does the work '), `(Claude app or claude.ai, with your Free / Pro / Max plan) — it ${what}; noema-lite only shows you what to paste into a Claude chat, and the results arrive here by themselves.`),
      el('ul', { class: 'tiny' }, el('li', {}, 'Usually cheaper than an API key: no extra cost beyond your plan. The bigger the Roadmap, the bigger the saving (an API key costs a few dollars per prepared step). Your plan has usage limits, so a big Roadmap may take a few days.'),
        el('li', {}, cloudOn(acc) ? '☁️ Cloud account: ✅ — Claude saves into it through the noema-lite connector.' : el('span', { class: 'cg-warn' }, '☁️ The connector needs a noema-lite cloud account (⚙️ → Cloud). Without it you can still copy each task into Claude and paste the answer back.')),
        el('li', {}, 'First time? ', el('button', { class: 'linklike', onclick: e => { e.preventDefault(); setupClaude(acc); } }, 'Set up Claude (way C, 5 minutes)'), ' — the connector + code execution.')));
    const sync = () => { const a = sel.value === 'claudeapp'; app.style.display = a ? '' : 'none'; keys.style.display = a ? 'none' : ''; };
    sel.addEventListener('change', sync); sync();
    return { sel, box: el('div', {}, el('label', { class: 'cg-field' }, 'Use', sel), app, keys) };
  }
  function setupClaude(acc) {
    if (!window.Noema?.claudeSetupView) return;
    overlay((b, close) => b.append(head('🤖 Set up Claude', 'Way C is the one for Roadmaps with your Claude plan.'), window.Noema.claudeSetupView(acc, { open: 'C' }), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close'))));
  }
  /** What the Claude app still has to do for a curriculum, and how to get it done (with or without the connector). */
  function appPanel(acc, cid, { onStudy, nid = null } = {}) {
    J().App.start(acc);
    const wrap = el('div', { class: 'cm-apppanel' });
    let count = 1, pasteOut = null;
    const draw = () => {
      const c = C().get(acc, cid); if (!c) return; const w = J().work(c); wrap.innerHTML = '';
      const todo = [w.graph ? `the Roadmap (${{ dag: 'agent 1 of 3', audit: 'agent 2 of 3', expand: 'agent 3 of 3' }[w.graph]})` : null, w.toPlan.length ? `the chapters of ${w.toPlan.length} step${w.toPlan.length > 1 ? 's' : ''}` : null, w.steps.length ? `${w.steps.length} step${w.steps.length > 1 ? 's' : ''} to prepare` : null].filter(Boolean);
      const A = J().App; const ago = A.last ? Math.max(0, Math.round((Date.now() - A.last) / 1000)) : null;
      const cnt = el('select', { class: 'noema-input cm-count', 'aria-label': 'Steps to prepare in one chat', onchange: e => { count = +e.target.value; } }, ...[1, 2, 3, 5].map(n => el('option', { value: n }, n === 1 ? '1 step per chat (recommended)' : `${n} steps in one chat`))); cnt.value = String(count);
      wrap.append(el('div', { class: 'cm-appwait' }, w.done ? '✅ Nothing is waiting for your Claude app.' : el('span', {}, '💬 Waiting for your Claude app: ', el('b', {}, todo.join(' · ')))),
        w.done ? null : el('ol', { class: 'cg-steps cm-appsteps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Open a new chat in Claude'), tip('The Claude app (computer or phone) or claude.ai, with the noema-lite connector switched on (in the chat: + → Connectors). Only the first time: ❓ Set up Claude → C.')),
            el('div', { class: 'row' }, el('a', { class: 'btn small', href: 'https://claude.ai/new', target: '_blank', rel: 'noopener' }, 'Open Claude ↗'), el('button', { class: 'btn small ghost', onclick: () => setupClaude(acc) }, 'First time? Set up Claude'))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Paste this message and send it'), tip('Claude asks the connector for the next task, does it and saves the result into your account — the Roadmap, the chapter plans, then the queued steps. One step per chat keeps Claude fast and focused; for the next step paste the same message into a new chat.')),
            w.steps.length > 1 ? el('label', { class: 'cg-field' }, 'Steps in this chat', cnt) : null,
            el('div', { class: 'row' }, el('button', { class: 'btn primary cm-copymsg', onclick: e => { try { localStorage.setItem('noema:appUsed:' + acc, '1'); } catch (x) { } copy(J().message(C().get(acc, cid), { count }), e.currentTarget); } }, '📋 Copy the message for Claude'))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Come back here')), el('p', { class: 'tiny' }, 'What Claude saves appears here by itself (checked when you return to this page, and every 20 seconds while something waits). ', A.error ? el('span', { class: 'cg-warn' }, '⚠️ ' + A.error + ' ') : null, ago != null ? `Last check: ${ago < 5 ? 'just now' : ago + ' s ago'}. ` : ''),
            el('button', { class: 'btn small cm-checknow', onclick: async e => { e.currentTarget.disabled = true; const n = await A.poll(acc).catch(() => 0); toast(n ? `💬 ${n} result(s) from your Claude app` : '💬 Nothing new yet', 2500); draw(); } }, '⟳ Check now'))),
        w.done ? null : manual(c, w));
    };
    const manual = (c, w) => {
      const t = A0(); const box = el('details', { class: 'cg-faq cm-manual' }, el('summary', {}, 'No connector? Do it by hand'));
      if (t) {
        const ans = el('textarea', { class: 'noema-input cm-paste', rows: 4, placeholder: 'Paste Claude’s answer here (the JSON object)' });
        const out = el('div', { class: 'tiny cm-pasteout' }); if (pasteOut) out.append(pasteOut);
        box.append(el('p', { class: 'tiny' }, `Next task: ${t.title}. Copy it into any Claude chat${t.files?.length ? ' and attach the files it names' : ''}, then paste Claude’s answer below — noema-lite checks it exactly like its own agents.`),
          t.files?.length ? el('div', { class: 'row' }, el('span', { class: 'tiny' }, `📎 ${t.files.join(', ')}`), el('button', { class: 'btn small cm-planfiles', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { for (const sid of t.steps) for (const f of C().get(acc, cid).nodes[sid]?.material?.files || []) { if (!t.files.includes(f.name)) continue; const rec = await C().materialFile(acc, C().get(acc, cid), sid, f).catch(() => null); if (rec?.blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(rec.blob); a.download = f.name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 15000); t.files = t.files.filter(x => x !== f.name); } } } finally { b.disabled = false; } } }, '⬇️ Download them')) : null,
          el('div', { class: 'row' }, el('button', { class: 'btn small cm-copytask', onclick: e => copy(t.text, e.currentTarget) }, '📋 Copy the task')), ans,
          el('div', { class: 'row' }, el('button', { class: 'btn small primary cm-usepaste', onclick: () => {
            const r = J().App.paste(acc, cid, t.id, ans.value);
            if (r.errors) { const msg = `Your answer has these problems:\n- ${r.errors.slice(0, 30).join('\n- ')}\nFix ALL of them and send the complete corrected JSON object again.`; pasteOut = el('div', { class: 'cg-kstat bad' }, `⚠️ ${r.errors.length} problem(s): ${r.errors.slice(0, 3).join(' · ')}${r.errors.length > 3 ? ' …' : ''} `, el('button', { class: 'btn small', onclick: e => copy(msg, e.currentTarget) }, '📋 Copy the problems for Claude')); }
            else pasteOut = el('div', { class: 'cg-kstat ok' }, '✓ Accepted' + r.line.replace(/^\s*✓?/, ' —'));
            draw(); wrap.querySelector('.cm-manual')?.setAttribute('open', '');
          } }, '✔ Use Claude’s answer')), out);
      }
      if (w.steps.length) {
        const sid = nid && w.steps.includes(nid) ? nid : w.steps[0]; const n = c.nodes[sid];
        box.append(el('p', { class: 'tiny' }, `Steps: download a step’s bundle (its task, your files and the toolkit), attach it to a Claude chat and ask Claude to follow TASK.md; then import the .noema.zip Claude gives you. Next step: “${n.title}”.`),
          el('div', { class: 'row' }, el('button', { class: 'btn small cm-bundle', onclick: async e => { const b = e.currentTarget; b.disabled = true; try { const r = await J().App.bundle(acc, cid, sid); toast(`⬇️ ${r.name}` + (r.missing.length ? ` — ⚠️ not on this device: ${r.missing.join(', ')}` : ''), 4000); } catch (x) { toast('⚠️ ' + x.message, 4000); } b.disabled = false; } }, `⬇️ Bundle for “${n.title}”`),
            importBtn(acc, cid, sid, draw)));
      }
      return box;
    };
    const A0 = () => J().App.copyTask(acc, cid);
    draw(); const offA = C().onChange(() => { if (wrap.isConnected) draw(); else offA(); }); const offB = J().App.onChange(() => { if (wrap.isConnected) draw(); else offB(); });
    return wrap;
  }
  /** 📥 The package Claude made for a step (.noema.zip / .json). */
  function importBtn(acc, cid, nid, after) {
    return el('label', { class: 'btn small cm-importpkg' }, '📥 Import its package', el('input', { type: 'file', accept: '.zip,.json', style: { display: 'none' }, onchange: async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return; toast('📦 Importing…', 1500);
      try { const r = await J().App.importPackage(acc, cid, nid, f); toast(`🧭 “${r.title}” is ready to study`, 3500); after?.(); } catch (x) { toast('⚠️ ' + x.message, 6000); }
    } }));
  }

  function create(acc, { onStudy } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      const goal = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'e.g. “Bayesian statistics”, “Cardiac physiology”, “Databricks Lakehouse”, “Ancient Greek tragedy”' });
      const lang = el('select', { class: 'noema-input' }, ...Object.entries(C().LANG).map(([v, t]) => el('option', { value: v }, t))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: 'Optional: what you already know, e.g. “high-school maths, some Python”' });
      const depth = el('select', { class: 'noema-input' }, el('option', { value: 'standard' }, 'Standard — 12–20 steps for the goal'), el('option', { value: 'deep' }, 'Deep — 20–40 steps for the goal (recommended)'), el('option', { value: 'exhaustive' }, 'Exhaustive — 40+ steps for the goal')); depth.value = 'deep';
      const apps = el('select', { class: 'noema-input' }, el('option', { value: '2-4' }, '2–4 applications'), el('option', { value: '3-6' }, '3–6 applications'), el('option', { value: '5-8' }, '5–8 applications')); apps.value = '3-6';
      const scope = el('input', { class: 'noema-input', placeholder: 'Optional: scope, e.g. “for clinicians”, “exam: AWS SAA”, “focus on the mathematics”' });
      const constraints = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'Optional: anything else the agents must respect' });
      const PP = providerPick(acc), provider = PP.sel;
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} step${n > 1 ? 's' : ''} ahead` : 'only when I open a step'))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(prefs(acc).curBudget || 8) });
      const err = el('div', { class: 'tiny cg-kstat bad' });
      const attachFirst = el('input', { type: 'checkbox', class: 'cm-attachfirst' });
      const go = el('button', { class: 'btn primary cg-go', onclick: () => {
        err.textContent = '';
        if (goal.value.trim().length < 3) { err.textContent = '👆 Type the goal topic first.'; goal.focus(); return; }
        if (provider.value !== 'claudeapp' && !LLM().pick(acc, provider.value)) { err.textContent = '👆 Add a Claude API key or a Gemini key first (above) — or choose the Claude app.'; return; }
        const [a1, a2] = apps.value.split('-').map(Number);
        const c = C().blank({ goal: goal.value, language: lang.value, learner: learner.value, depth: depth.value, apps: [a1, a2], scope: scope.value, constraints: constraints.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8) });
        if (attachFirst.checked) c.attachFirst = true;   // 📦 the map waits for the learner's own subjects before its steps are planned
        C().save(acc, c); close(); progress(acc, c, { onStudy, start: true });
      } }, '🧭 Build my Roadmap');
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); library(acc, { onStudy }); } }, '← Roadmaps'),
        head('➕ New Roadmap', 'Four AI agents lay out what you need to learn: every prerequisite, the whole goal, and its applications.'),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Which AI builds it?'), tip(el('div', {}, el('p', {}, el('b', {}, '💬 Claude app (recommended): '), 'your own Claude — the Claude app or claude.ai with your Free / Pro / Max plan — runs the four agents and prepares the steps. noema-lite shows you one message to paste into a Claude chat; what Claude makes arrives here by itself (through the noema-lite connector), or you paste it back by hand. No cost beyond your plan — usually the cheapest way, especially for big Roadmaps; your plan’s usage limits may spread the work over a few days.'), el('p', {}, el('b', {}, 'API key / Gemini: '), 'everything runs here while this page is open. The keys stay on this device. Building the Roadmap costs cents to about a dollar with a Claude API key, and each prepared step a few dollars; Gemini’s free key costs nothing but makes simpler subjects.')))), PP.box),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'What do you want to master?'), tip('One topic, as specific or as broad as you like. The agents find what you need before it (prerequisites) and where it is used (applications).')), goal,
            el('label', { class: 'cg-field' }, 'Language of the course', lang), el('label', { class: 'cg-field' }, 'Your starting point', learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'How big?'), tip('Depth decides how finely the goal itself is split. The prerequisites are always as complete as needed for your starting point.')),
            el('label', { class: 'cg-field' }, 'Depth', depth), el('label', { class: 'cg-field' }, 'Applications', apps),
            el('details', { class: 'cg-faq' }, el('summary', {}, 'More options'), el('label', { class: 'cg-field' }, 'Scope', scope), el('label', { class: 'cg-field' }, 'Requirements', constraints))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Preparing the steps'), tip('Every step becomes a full subject, made from official sources. noema-lite prepares the next open steps in the background while the app is open, so they are ready when you get there.')),
            el('label', { class: 'cg-field' }, 'Prepare ahead', prefetch, tip('With the Claude app: how many of the next open steps wait in its queue, ready for you to paste the message into Claude.')), el('label', { class: 'cg-field' }, 'Claude API key: stop and ask me when one step costs more than $', budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Use subjects you already have'), tip('When the Roadmap is ready, before its steps are planned, you attach the subjects you already have (your own, imported or shared with you) to the steps they teach. Those steps are planned from the subject and never generated — no agent touches them. You can also do it later, on any step: 📦 Use a subject I have.')),
            el('label', { class: 'tiny' }, attachFirst, ' Let me attach my subjects to its steps before they are planned')),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Build')), go, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      setTimeout(() => goal.focus(), 200);
    });
  }

  /* ======================= 🔔 a member takes the owner's changes they want (docs/CURRICULUM.md §8) ======================= */
  const CHANGE_ICON = { map: '🧭', add: '➕', del: '➖', info: '✏️', plan: '📝', mat: '📎', links: '🔗' };
  async function reviewChanges(acc, cid, { onDone = () => { } } = {}) {
    let inc; try { inc = await SH().incoming(acc, cid); } catch (e) { toast('⚠️ ' + e.message, 5000); return; }
    const c = C().get(acc, cid); if (!c) return;
    if (!inc.list.length) { if (inc.record) await SH().takeChanges(acc, cid, [], inc); toast('Nothing new to take — your copy is up to date.', 3500); onDone(); return; }
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-review');
      const rows = inc.list.map(ch => { const cb = el('input', { type: 'checkbox', 'data-key': ch.key }); cb.checked = !ch.own; return [ch, cb]; });
      const done = async keys => { try { await SH().takeChanges(acc, cid, keys, inc); toast(keys.length ? `✅ Took ${keys.length} change${keys.length === 1 ? '' : 's'} into your copy` : '👍 You keep your copy — these changes are not offered again unless they change.', 4500); close(); onDone(); } catch (e) { toast('⚠️ ' + e.message, 5000); } };
      box.append(head(`🔔 ${c.shared?.ownerName || 'The owner'} changed “${c.title || c.goal}”`, 'Tick what you take into your copy of the Roadmap. Your progress, your settings and your own subjects on steps stay as they are. What you leave is not offered again unless it changes again.'),
        el('div', { class: 'cm-changes' }, ...rows.map(([ch, cb]) => el('label', { class: 'cm-change' + (ch.own ? ' own' : '') }, cb, el('span', {}, (CHANGE_ICON[ch.kind] || '•') + ' ' + ch.text)))),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary cm-takechanges', onclick: () => done(rows.filter(([, cb]) => cb.checked).map(([ch]) => ch.key)) }, '✓ Take the ticked changes'),
          el('button', { class: 'btn small cm-keepmine', onclick: () => done([]) }, 'Keep my copy'), el('button', { class: 'btn small ghost', onclick: close }, 'Not now')));
    });
  }

  /* ======================= 📦 subjects you already have, on steps (docs/CURRICULUM.md §9) ======================= */
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'your', 'how', 'what', 'its', 'introduction', 'intro', 'basics', 'fundamentals', 'part', 'step', 'course']);
  const words = t => new Set(String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9α-ωа-я]+/).filter(w => w.length > 2 && !STOP.has(w)));
  /** How much two titles share (0–1) — the simple “suggest matches”, no AI. */
  const likeness = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / Math.min(A.size, B.size); };
  /** Subjects that may teach a step: the learner's library without language courses (they are studied on their own). */
  const attachable = async acc => (await window.Noema.subjectsFor(acc)).filter(s => !s.hidden && s.kind !== 'language' && !String(s.id).startsWith('lang:'));
  const whereOf = (acc, id) => { const on = C().stepsOf(acc, id); return on.length ? (on.length === 1 ? `on “${on[0].c.nodes[on[0].nid].title}”` : `on ${on.length} steps`) : '📚 on the Shelf'; };
  /** The warning shown before a subject is attached: only this step changes. */
  function attachWarning(c, nid) {
    const n = c.nodes[nid]; if (!n) return null; const kids = c.edges.filter(e => e.from === nid).length;
    return el('div', { class: 'cm-attachwarn', role: 'note' }, el('b', {}, '⚠️ Only this step is re-planned. '),
      n.chapters?.length ? 'Its chapters and goals are redesigned to follow the subject, and the step stays closed until its new plan is here. ' : 'Its chapters are planned from the subject. ',
      n.pack?.id && !n.pack.assigned && n.pack.status === 'ready' ? 'The subject prepared for it goes to your 📚 Shelf — nothing is deleted. ' : '',
      kids ? `The ${kids} step${kids === 1 ? '' : 's'} after it keep${kids === 1 ? 's its' : ' their'} plan — check ${kids === 1 ? 'it' : 'them'} afterwards. ` : '',
      'The subject itself does not change, and your progress in it stays.',
      c.shared && !c.shared.ended ? el('div', { class: 'cm-attachshared' }, '👥 This Roadmap is shared: the change is yours only. The others keep the shared step and its plan, and your subject is never shared with them.') : null);
  }
  /** 📖 The step a subject is studied from, in this tab: one subject may teach several steps (loader.js stepOf). */
  const viaStep = (acc, cid, nid, sid) => { try { if (nid) sessionStorage.setItem('noema-device:viaStep', JSON.stringify({ acc, sid, id: cid, node: nid })); else sessionStorage.removeItem('noema-device:viaStep'); } catch (e) { } };
  const replanBusy = new Set(), replanAgain = new Set();
  /** 🔄 Re-plan a step that a subject was attached to — here with an API key / Gemini (the Claude app does it by itself).
      Another subject attached while it runs: its answer is dropped (Edit.plan → stale) and the step is planned again. */
  async function replanNow(acc, cid, nid) {
    const key = cid + '/' + nid; if (replanBusy.has(key)) { replanAgain.add(key); return; } replanBusy.add(key);
    const c0 = C().get(acc, cid); const t = c0?.nodes[nid]?.title || nid;
    try { let r; do { replanAgain.delete(key); r = await C().Edit.plan(acc, cid, [nid]); } while ((replanAgain.has(key) || r?.stale?.includes(nid)) && C().get(acc, cid)?.nodes[nid]?.replan); if (r?.queued) toast(`🔄 Your Claude app re-plans “${t}” — copy the message from the 💬 bar of the Roadmap.`, 5000); else toast(`✅ “${t}” has its new plan${C().get(acc, cid)?.nodes[nid]?.pack?.assigned ? ' — it follows its subject and is open again' : ''}.`, 4000); }
    catch (e) { toast(`⚠️ “${t}” was not re-planned: ${e.message} — tap ↻ Re-plan now on the step to try again.`, 7000); }
    finally { replanBusy.delete(key); replanAgain.delete(key); const cc = C().get(acc, cid); if (cc) C().save(acc, cc); }
  }
  /** Attach (C().Edit.assign), then re-plan only that step: right away here, or by the Claude app. → true when attached */
  async function doAttach(acc, cid, nid, sid, { from = 'me', quiet = false } = {}) {
    const r = await C().Edit.assign(acc, cid, nid, sid, { from });
    if (r.error) { toast('⚠️ ' + r.error, 6000); return false; }
    const c = C().get(acc, cid), n = c.nodes[nid];
    if (!r.replan) { if (!quiet) toast(`📦 “${n.pack.title}” now teaches “${n.title}”`, 3500); return true; }
    if (c.provider === 'claudeapp') { toast(`📦 Attached — 🔄 your Claude app re-plans “${n.title}” (copy the message from the 💬 bar of the Roadmap).`, 6000); return true; }
    if (!LLM().pick(acc, c.provider)) { toast(`📦 Attached — 🔄 “${n.title}” needs its new plan: add a Claude API key or a Gemini key, then tap ↻ Re-plan now on the step.`, 7000); return true; }
    toast(`📦 Attached — 🔄 re-planning “${n.title}”…`, 3500); replanNow(acc, cid, nid);
    return true;
  }
  /** 📦 Attach a subject to a step. With cid + nid: choose the subject. With subject: choose the curriculum and the step (“Put on a map…”). */
  async function attachDialog(acc, { cid = null, nid = null, subject = null, onDone = () => { } } = {}) {
    const subs = subject ? [] : (await attachable(acc)).filter(s => !(cid && C().get(acc, cid)?.nodes[nid]?.pack?.id === s.id));
    const own = C().list(acc).filter(x => Object.keys(x.nodes || {}).length && !['dag', 'audit', 'expand'].includes(x.stage));
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-attach');
      let pickS = subject?.id || null, pickC = cid || (own[0]?.id || null), pickN = nid;
      const warn = el('div'), err = el('div', { class: 'tiny cg-kstat bad' });
      const go = el('button', { class: 'btn primary cm-attachgo', disabled: true, onclick: async () => {
        go.disabled = true; err.textContent = '';
        const ok = await doAttach(acc, pickC, pickN, pickS);
        if (ok) { close(); onDone({ cid: pickC, nid: pickN, subjectId: pickS }); } else go.disabled = false;
      } }, '📦 Attach and re-plan this step');
      const refresh = () => { warn.innerHTML = ''; const c = pickC && C().get(acc, pickC); if (c && pickN) warn.append(attachWarning(c, pickN)); go.disabled = !(pickS && pickC && pickN); };
      let chooser;
      if (!subject) {   // which of my subjects teaches this step?
        const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 Search your subjects…', oninput: () => drawList() });
        const list = el('div', { class: 'noema-chips cm-attachchips' });
        const drawList = () => {
          list.innerHTML = ''; const term = q.value.trim().toLowerCase();
          const items = subs.filter(s => !term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term));
          list.append(...items.map(s => el('button', { class: 'noema-chip cm-attachchip' + (pickS === s.id ? ' on' : ''), 'aria-pressed': String(pickS === s.id), 'data-id': s.id, title: s.description || '', onclick: () => { pickS = s.id; list.querySelectorAll('.cm-attachchip').forEach(b => { const on = b.dataset.id === s.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); refresh(); } },
            el('span', { class: 'e' }, s.emoji || '📘'), el('span', { class: 't' }, s.title), el('span', { class: 'o tiny' }, whereOf(acc, s.id)))));
          if (!items.length) list.append(el('p', { class: 'tiny' }, subs.length ? 'No subject matches.' : 'You have no other subjects yet — import one (📥) or make one with ✨ Create with Claude.'));
        };
        drawList(); chooser = el('div', {}, q, list);
      } else if (!own.length) {   // “Put on a map…” without a curriculum yet
        chooser = el('div', { class: 'empty' }, el('p', {}, 'You have no Roadmap yet. Make one for the goal this subject serves — then attach the subject to its step.'),
          el('button', { class: 'btn', onclick: () => { close(); create(acc, {}); } }, '➕ New Roadmap'));
      } else {   // which curriculum, which step?
        const csel = el('select', { class: 'noema-input', 'aria-label': 'Roadmap' }, ...own.map(x => el('option', { value: x.id }, (x.shared && !x.shared.ended ? '👥 ' : '🧭 ') + (x.title || x.goal))));
        const nsel = el('select', { class: 'noema-input', 'aria-label': 'Step' });
        const fill = () => {
          const c = C().get(acc, csel.value); pickC = csel.value; nsel.innerHTML = '';
          nsel.append(el('option', { value: '' }, '— choose the step it teaches —'), ...C().order(c).map(id => { const n = c.nodes[id], pk = n.pack || {};
            return el('option', { value: id, disabled: pk.status === 'generating' || (pk.assigned && pk.id === subject.id) }, `${ICON[n.role] || '•'} ${n.title}${pk.assigned ? ` — 📦 ${pk.title || pk.id}` : pk.status === 'ready' ? ' — ⚡ prepared' : pk.status === 'generating' ? ' — ⏳ being prepared' : ''}`); }));
          const best = C().order(c).map(id => [id, likeness(c.nodes[id].title + ' ' + (c.nodes[id].summary || ''), subject.title)]).sort((a, b) => b[1] - a[1])[0];
          pickN = best && best[1] >= 0.5 && !c.nodes[best[0]].pack?.assigned ? best[0] : null; nsel.value = pickN || ''; refresh();
        };
        csel.value = pickC; csel.onchange = fill; nsel.onchange = () => { pickN = nsel.value || null; refresh(); };
        chooser = el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, 'Roadmap', csel), el('label', { class: 'cg-field' }, 'Step', nsel)); fill();
      }
      const n0 = cid && C().get(acc, cid)?.nodes[nid];
      box.append(head('📦 ' + (subject ? `Put “${subject.title}” on a Roadmap` : `A subject for “${n0?.title || ''}”`),
        subject ? 'Choose the step of a Roadmap that this subject teaches. The step is then studied from it — never generated.' : 'Choose a subject you already have. This step is then studied from it — never generated, no agent touches it.'),
        chooser, warn, err, el('div', { class: 'row noema-ovfoot' }, go, el('button', { class: 'btn small', onclick: close }, 'Cancel')));
      refresh();
    });
  }
  /** 📦 While a map is being created (or any time): attach subjects you already have to many steps at once. */
  async function attachMany(acc, cid, { onDone = () => { } } = {}) {
    const subs = await attachable(acc); const c = C().get(acc, cid); if (!c) return;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-attachmany');
      const rows = C().order(c).map(id => { const n = c.nodes[id]; const gen = n.pack?.status === 'generating';
        const sel = el('select', { class: 'noema-input', 'aria-label': 'Subject for ' + n.title, disabled: gen }, el('option', { value: '' }, n.pack?.status === 'ready' && !n.pack.assigned ? '⚡ its own prepared subject' : '— none: planned and prepared as usual —'), ...subs.map(s => el('option', { value: s.id }, `${s.emoji || '📘'} ${s.title}`)));
        sel.value = n.pack?.assigned ? n.pack.id : ''; return { id, n, sel }; });
      const msg = el('span', { class: 'tiny' });
      const suggest = () => {
        let k = 0; const used = new Set(rows.map(r => r.sel.value).filter(Boolean));
        for (const s of subs) { if (used.has(s.id)) continue; let best = null, bs = 0; for (const r of rows) { if (r.sel.value || r.sel.disabled) continue; const v = likeness(r.n.title + ' ' + (r.n.summary || ''), s.title); if (v > bs) { bs = v; best = r; } } if (best && bs >= 0.5) { best.sel.value = s.id; used.add(s.id); k++; } }
        msg.textContent = k ? `✨ ${k} suggestion${k === 1 ? '' : 's'} — check them before you attach.` : 'No clear matches — choose them yourself.';
      };
      const go = el('button', { class: 'btn primary cm-attachmanygo', onclick: async () => {
        go.disabled = true; let k = 0;
        for (const r of rows) { const want = r.sel.value, cur = C().get(acc, cid).nodes[r.id]; if (!cur || r.sel.disabled) continue;
          if (want && !(cur.pack?.assigned && cur.pack.id === want)) { if (await doAttach(acc, cid, r.id, want, { quiet: true })) k++; }
          else if (!want && cur.pack?.assigned) C().Edit.detach(acc, cid, r.id); }
        close(); if (k) toast(`📦 ${k} step${k === 1 ? ' is' : 's are'} taught by your own subjects now`, 4000); onDone(k);
      } }, '📦 Attach the chosen subjects');
      box.append(head('📦 Use subjects you already have', 'Attach them to the steps they teach: those steps are planned from the subject and never generated (no agent touches them). Steps without one are planned and prepared as usual.'),
        el('div', { class: 'cm-attachwarn tiny', role: 'note' }, '⚠️ Only the steps you attach a subject to change. A step that already has its chapters is re-planned to follow its subject and stays closed until its new plan is here; a subject prepared for it goes to your 📚 Shelf.'),
        subs.length ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: suggest }, '✨ Suggest matches'), msg) : el('p', { class: 'tiny' }, 'You have no subjects to attach yet.'),
        el('ol', { class: 'cm-attachlist' }, ...rows.map(r => el('li', {}, el('span', { class: 'cm-attachstep' }, `${ICON[r.n.role] || '•'} ${r.n.title}`), r.sel))),
        el('div', { class: 'row noema-ovfoot' }, go, el('button', { class: 'btn small', onclick: close }, 'Cancel')));
    });
  }
  /** ▶ The learner is done attaching: the other steps are planned now. */
  function planNow(acc, cid, { onStudy } = {}) {
    const c = C().get(acc, cid); if (!c) return; delete c.attachFirst;
    if (c.provider === 'claudeapp') { if (c.status === 'attach') c.status = 'ready'; C().save(acc, c); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); toast('💬 Your Claude app plans the steps now — copy the message from the 💬 bar of the Roadmap.', 5000); map(acc, cid, { onStudy, appHelp: false }); return; }
    c.status = 'paused'; C().save(acc, c); progress(acc, c, { onStudy, start: true });
  }

  /* ======================= building progress ======================= */
  const STAGES = [['dag', '🧭 Agent 1 · all prerequisites + applications'], ['audit', '🔍 Agent 1b · are the prerequisites complete?'], ['expand', '🎯 Agent 2 · the whole goal, in depth'], ['plan', '📚 Agent 3 · chapters, learning goals, outcomes']];
  const stagesOf = c => c.imported ? [['import', '📥 Your Roadmap — imported as it is (no AI involved)'], STAGES[3]] : STAGES;
  function progress(acc, c, { onStudy, start = false } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      let ctl = null;
      const stages = el('ol', { class: 'cm-stages' }); const log = el('ol', { class: 'cg-log', 'aria-live': 'polite' }); const status = el('div', { class: 'cg-status' }); const actions = el('div', { class: 'row' }); const bar = el('div', { class: 'cm-bar' }, el('i', {}));
      const paint = () => {
        const SG = stagesOf(c); const i = SG.findIndex(s => s[0] === c.stage);
        stages.innerHTML = ''; SG.forEach(([k, t], j) => stages.append(el('li', { class: c.stage === 'done' || j < i ? 'done' : j === i ? (ctl ? 'now' : 'wait') : '' }, (c.stage === 'done' || j < i ? '✅ ' : j === i && ctl ? '⏳ ' : j === i && c.status === 'waiting' ? '💬 ' : '◻️ ') + t)));
        status.className = 'cg-status ' + c.status;
        status.textContent = ctl ? '🧠 The agents are working — keep this page open (other tabs are fine).' : c.status === 'attach' ? '📦 The Roadmap is ready. Attach the subjects you already have to its steps — then the other steps are planned.' : c.status === 'ready' ? '✅ Your Roadmap is ready.' : c.status === 'waiting' ? '💬 Your Claude app builds the Roadmap — follow the steps below.' : c.status === 'failed' ? '⚠️ ' + (c.error || 'Stopped') : c.status === 'paused' ? '⏸️ Paused.' : '';
        actions.innerHTML = '';
        appBox.style.display = c.provider === 'claudeapp' && c.status === 'waiting' ? '' : 'none';
        if (c.status === 'waiting') actions.append(el('button', { class: 'btn small', title: 'Use an API key or Gemini instead (everything runs here)', onclick: () => { const k = LLM().pick(acc, 'auto'); if (!k) { toast('Add a Claude API key or a Gemini key first (⚙️ Settings / ✨ Create with Claude).', 4000); return; } c = C().get(acc, c.id); c.provider = 'auto'; c.status = 'building'; C().save(acc, c); run(); } }, 'Use my API key here instead'), el('button', { class: 'btn small ghost', onclick: () => { if (confirm('Delete this Roadmap?')) { C().remove(acc, c.id); close(); library(acc, { onStudy }); } } }, '🗑 Delete'));
        else if (ctl) actions.append(el('button', { class: 'btn', onclick: () => ctl.abort() }, '⏹ Stop'));
        else if (c.status === 'ready') actions.append(el('button', { class: 'btn primary', onclick: () => { close(); map(acc, c.id, { onStudy }); } }, '🗺️ Open the Roadmap'));
        else if (c.status === 'attach') actions.append(el('button', { class: 'btn primary cm-attachsubs', onclick: () => attachMany(acc, c.id, { onDone: () => { c = C().get(acc, c.id); paint(); } }) }, '📦 Attach subjects'),
          el('button', { class: 'btn cm-plannow', onclick: () => { close(); planNow(acc, c.id, { onStudy }); } }, '▶ Plan the steps now'), el('button', { class: 'btn small', onclick: () => { close(); map(acc, c.id, { onStudy }); } }, '🗺️ Open the Roadmap'));
        else actions.append(el('button', { class: 'btn primary', onclick: run }, '▶ Continue'), el('button', { class: 'btn small ghost', onclick: () => { if (confirm('Delete this Roadmap?')) { C().remove(acc, c.id); close(); library(acc, { onStudy }); } } }, '🗑 Delete'));
      };
      const add = m => { log.append(el('li', {}, m)); while (log.children.length > 120) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
      (c.log || []).slice(-30).forEach(x => add(x.m));
      const appBox = c.provider === 'claudeapp' ? appPanel(acc, c.id, { onStudy }) : el('div');
      let seen = (c.log || []).length;
      const offW = C().onChange((a, cur) => { if (!box.isConnected) { offW(); return; } if (cur?.id !== c.id || ctl) return; c = cur; (c.log || []).slice(seen).forEach(x => add(x.m)); seen = (c.log || []).length; paint(); });
      async function run() {
        ctl = new AbortController(); paint();
        const wl = await navigator.wakeLock?.request('screen').catch(() => null);
        try { c = await C().build(acc, c, { signal: ctl.signal, onLog: (m, cur, extra) => { c = cur; add(m); if (extra?.progress) bar.firstChild.style.width = fmtPct(extra.progress); paint(); } }); }
        finally { wl?.release?.(); ctl = null; paint(); }
        if (c.status === 'ready') { G().kick(); }
      }
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { if (ctl && !confirm('The agents work only while this window is open. Stop?')) return; ctl?.abort(); close(); library(acc, { onStudy }); } }, '← Roadmaps'),
        head(`🧭 “${c.title || c.goal}”`, c.imported ? `${C().LANG[c.language] || c.language} · your Roadmap, ${Object.keys(c.nodes).length} steps · ${c.learner || 'from the basics'}` : `${C().LANG[c.language] || c.language} · ${c.depth} · ${c.learner || 'from the basics'}`), stages, bar, status, appBox, actions,
        el('details', { class: 'cg-logbox', open: true }, el('summary', {}, 'What the agents are doing'), log));
      paint(); if (start || c.status === 'building') run();
    }, { closable: false });
    window.NoemaCurJobs?.App.start(acc);
  }


  /* ======================= ✏️ editing a step / 📝 reviewing it before it is prepared ======================= */
  const RLABEL = { foundation: '🧱 Prerequisite', intro: '🚪 Introduction to the goal', aspect: '🎯 Aspect of the goal', subtopic: '🔹 Sub-topic of the goal', related: '🔗 Related topic', synthesis: '🏁 Synthesis', application: '🚀 Application' };
  function editStep(acc, cid, id, { mode = 'edit', onDone = () => { } } = {}) {
    const E = C().Edit; let c = C().get(acc, cid); const n = id ? c.nodes[id] : null; const locked = n && E.planLocked(n);   // 📦 a step taught by an attached subject keeps an editable plan
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-editor');
      const T = x => c.nodes[x]?.title || x;
      const title = el('input', { class: 'noema-input', value: n?.title || '', placeholder: 'Name of the step', maxlength: '120' });
      const summary = el('textarea', { class: 'noema-input', rows: 2, placeholder: 'What this step teaches (one or two sentences)' }); summary.value = n?.summary || '';
      const role = el('select', { class: 'noema-input' }, ...E.ROLES.map(r => el('option', { value: r }, RLABEL[r]))); role.value = n?.role === 'goal' ? 'intro' : (n?.role || 'foundation');
      let parents = n ? c.edges.filter(e => e.to === id).map(e => e.from) : [], children = n ? c.edges.filter(e => e.from === id).map(e => e.to) : [];
      const links = (label, get, set, possible) => { const wrap = el('div', { class: 'cm-links' }); const draw = () => { wrap.innerHTML = ''; const cur = get(); const opts = possible().filter(x => !cur.includes(x)).sort((a, b) => T(a).localeCompare(T(b)));
        const sel = el('select', { class: 'noema-input', 'aria-label': 'Add ' + label }, el('option', { value: '' }, `➕ Add a ${label}…`), ...opts.map(x => el('option', { value: x }, T(x))));
        sel.addEventListener('change', () => { if (sel.value) { set([...cur, sel.value]); draw(); } });
        wrap.append(el('div', { class: 'cm-linkchips' }, ...cur.map(x => el('span', { class: 'cm-linkchip' }, T(x), el('button', { 'aria-label': 'Remove ' + T(x), onclick: () => { set(cur.filter(y => y !== x)); draw(); } }, '✕'))), cur.length ? null : el('span', { class: 'tiny' }, 'none')), sel); };
        draw(); return wrap; };
      const possibleP = () => n ? E.possibleParents(c, id).filter(x => !children.includes(x)) : Object.keys(c.nodes).filter(x => !children.includes(x));
      const possibleK = () => n ? E.possibleChildren(c, id).filter(x => !parents.includes(x)) : Object.keys(c.nodes).filter(x => !parents.includes(x));
      const goals = el('textarea', { class: 'noema-input', rows: 3, placeholder: 'One per line: “You can explain …”', disabled: locked }); goals.value = (n?.learningGoals || []).join('\n');
      let chapters = (n?.chapters || []).map(ch => ({ ...ch }));
      const chBox = el('ol', { class: 'cm-chedit' });
      const drawCh = () => {
        chBox.innerHTML = '';
        chapters.forEach((ch, i) => {
          const t = el('input', { class: 'noema-input', value: ch.title, 'aria-label': `Chapter ${i + 1} title`, disabled: locked, oninput: e => { ch.title = e.target.value; } });
          const g = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: 'Teaching goals — one per line', oninput: e => { ch.goals = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); g.value = (ch.goals || []).join('\n');
          const cv = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: 'Must cover — one per line', oninput: e => { ch.coverage = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); cv.value = (ch.coverage || []).join('\n');
          chBox.append(el('li', { class: 'cm-chrow' }, el('div', { class: 'cm-chline' }, t, locked ? null : [
            el('button', { class: 'btn small ghost', title: 'Move up', 'aria-label': 'Move chapter up', disabled: !i, onclick: () => { [chapters[i - 1], chapters[i]] = [chapters[i], chapters[i - 1]]; drawCh(); } }, '▲'),
            el('button', { class: 'btn small ghost', title: 'Move down', 'aria-label': 'Move chapter down', disabled: i === chapters.length - 1, onclick: () => { [chapters[i + 1], chapters[i]] = [chapters[i], chapters[i + 1]]; drawCh(); } }, '▼'),
            el('button', { class: 'btn small ghost', title: 'Remove', 'aria-label': 'Remove chapter', onclick: () => { chapters.splice(i, 1); drawCh(); } }, '✕')]),
            el('details', {}, el('summary', { class: 'tiny' }, 'Goals and coverage'), g, cv)));
        });
        if (!chapters.length) chBox.append(el('li', { class: 'tiny cm-empty' }, 'No chapters yet — add them, or let the AI plan them.'));
      };
      drawCh();
      const instr = el('input', { class: 'noema-input', placeholder: 'Optional wish for the AI, e.g. “more clinical examples”, “skip the history”' });
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('span', { class: 'tiny' });
      // 📎 the learner's own files for this step: the step is planned and built from them (no web research of the theory)
      const matBox = el('div', { class: 'cm-mat' });
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const drawMat = () => {
        matBox.innerHTML = ''; if (!n) return; const cc = C().get(acc, cid); const cur = cc?.nodes[id]?.material?.files || [];
        matBox.append(cur.length ? el('ul', { class: 'cm-matlist' }, ...cur.map(f => {
          const shared = f.fileId ? Object.values(cc.nodes).filter(x => x.id !== id && (x.material?.files || []).some(f2 => f2.fileId === f.fileId)) : [];
          const rg = el('input', { class: 'noema-input cm-range', placeholder: 'all pages', value: f.range ? `${f.range[0]}–${f.range[1]}` : '', disabled: locked, 'aria-label': 'Pages of ' + f.name + ' for this step', title: 'Only these pages of the file belong to this step (empty = the whole file)',
            onchange: e => { const r = E.setMaterialRange(acc, cid, id, f.srcId, parseRange(e.target.value)); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ pages saved — ✨ re-plan the chapters to follow them'; } });
          return el('li', {}, el('button', { class: 'linklike', title: '👁 Open', onclick: () => openMaterial(acc, cid, id, f) }, '📄 ' + f.name), el('span', { class: 'tiny' }, f.pages ? ` · ${f.pages} p.` : ''),
            f.pages || f.range ? el('label', { class: 'tiny cm-rangel' }, 'pages ', rg) : null,
            shared.length ? el('span', { class: 'tiny', title: 'The same file, stored once' }, ` · also for ${shared.map(x => '“' + x.title + '”').join(', ')}`) : null,
            locked ? null : el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name, onclick: async () => { await E.removeMaterial(acc, cid, id, f.srcId); drawMat(); } }, '✕'));
        })) : el('div', { class: 'tiny' }, 'None — the AI researches this step from authoritative sources.'));
        if (locked) return;
        const pg = el('input', { class: 'noema-input cm-range', placeholder: 'pages, e.g. 40–62 (optional)', 'aria-label': 'Pages for the next file' });
        const known = Object.entries(cc.files || {});
        const reuse = known.length ? el('select', { class: 'noema-input', 'aria-label': 'Use a file of this Roadmap', onchange: async e => { const fid = e.target.value; if (!fid) return; busy.textContent = '⏳ …'; const r = await E.addMaterial(acc, cid, id, [{ fileId: fid, range: parseRange(pg.value) }]); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ added — ✨ re-plan the chapters to follow it'; drawMat(); } },
          el('option', { value: '' }, '📚 Use a file of this Roadmap…'), ...known.map(([fid, x]) => el('option', { value: fid }, `${x.name}${x.pages ? ' (' + x.pages + ' p.)' : ''}`))) : null;
        matBox.append(el('div', { class: 'row cm-matadd' },
          el('label', { class: 'btn small' }, '📎 Add files', el('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async e => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; busy.textContent = '⏳ Reading the files…'; const r = await E.addMaterial(acc, cid, id, fs.map(file => ({ file, range: parseRange(pg.value) }))); busy.textContent = r.error ? '⚠️ ' + r.error : `✓ ${r.added.length} file(s) added — ✨ re-plan the chapters to follow them`; drawMat(); } })),
          reuse, pg));
      };
      drawMat();
      const collect = () => ({ title: title.value, summary: summary.value, role: role.value, parents, children, ...(locked ? {} : { learningGoals: goals.value.split('\n'), chapters }) });
      const save = () => { err.textContent = ''; const r = n ? E.update(acc, cid, id, collect()) : null; if (r?.error) { err.textContent = '⚠️ ' + r.error; return false; } return true; };
      const replan = el('button', { class: 'btn small', disabled: locked, onclick: async () => {
        if (n && !save()) return; busy.textContent = '⏳ The AI is planning the chapters…'; replan.disabled = true;
        try { const r = await E.plan(acc, cid, [id], { instruction: instr.value.trim() }); if (r.queued) { busy.textContent = '💬 Sent to your Claude app: it re-plans this step (copy the message from the 💬 bar of the Roadmap). Your current chapters stay until the new plan arrives.'; replan.disabled = false; return; } c = C().get(acc, cid); chapters = c.nodes[id].chapters.map(ch => ({ ...ch })); goals.value = c.nodes[id].learningGoals.join('\n'); drawCh(); busy.textContent = '✓ New plan — check it, change what you like, then save.'; }
        catch (e) { busy.textContent = '⚠️ ' + e.message; } replan.disabled = false;
      } }, c.provider === 'claudeapp' ? '✨ Re-plan with my Claude app' : '✨ Re-plan the chapters with AI');
      /** 📦 study the step from a subject the learner already has (only this step is re-planned) · ↩ take it off */
      const ownField = () => {
        if (!n || mode === 'add' || n.pack?.status === 'generating') return null;
        const pk = n.pack || {};
        return el('div', { class: 'cg-field cm-ownfield' }, el('b', {}, pk.assigned ? `📦 Taught by your subject “${pk.title || pk.id}”` : '📦 A subject you already have'),
          el('p', { class: 'tiny' }, pk.assigned ? 'Its chapters follow that subject; ✨ re-plan them to match it again.' : 'Study this step from it instead: only this step is re-planned.'),
          el('div', { class: 'row' },
            el('button', { class: 'btn small cm-usesubject', onclick: () => { if (!save()) return; close(); attachDialog(acc, { cid, nid: id, onDone: () => onDone() }); } }, pk.assigned ? '📦 Use another subject' : '📦 Use a subject I have'),
            pk.assigned ? el('button', { class: 'btn small ghost cm-detach', onclick: () => {
              if (!confirm(`Take “${pk.title || pk.id}” off this step?\nThe subject stays (on your 📚 Shelf when no other step uses it). ${n.groupPlan ? 'The step gets the shared plan back, and the version prepared for everybody.' : 'The step is then planned again and prepared the usual way.'}`)) return;
              const r = C().Edit.detach(acc, cid, id); if (r.error) { toast('⚠️ ' + r.error, 5000); return; }
              const cc = C().get(acc, cid); if (cc.nodes[id]?.replan && (cc.provider === 'claudeapp' || LLM().pick(acc, cc.provider))) replanNow(acc, cid, id);
              close(); onDone(); } }, '↩ Take it off this step') : null));
      };
      const head2 = mode === 'review' ? head('📝 Review this step before it is prepared', 'Change anything you like — the name, the goals, the chapters. When you confirm, the material is generated; after that the chapters can no longer change.')
        : mode === 'add' ? head('➕ Add a step', 'Name it, place it with its prerequisites and dependents; the AI can plan its chapters.')
          : head('✏️ Edit the step', locked ? 'Already prepared: you can rename it, move it and change its links; its chapters are fixed.' : 'Everything can change until the step is prepared.');
      const buttons = mode === 'review'
        ? [el('button', { class: 'btn primary', onclick: () => { if (!save()) return; close(); const cc = C().get(acc, cid); G().request(cc, id, { resume: true }); toast(cc.provider === 'claudeapp' ? '💬 Sent to your Claude app — copy the message from the Roadmap into a Claude chat.' : '⏳ Preparing “' + title.value + '” — 5–30 minutes; study something else meanwhile.', 5000); onDone(); } }, c.provider === 'claudeapp' ? '✅ Looks good — send it to my Claude app' : '✅ Looks good — prepare it'),
          el('button', { class: 'btn small', onclick: () => { if (save()) { close(); onDone(); } } }, 'Save changes only')]
        : mode === 'add'
          ? [el('button', { class: 'btn primary', onclick: async () => {
              err.textContent = ''; if (!title.value.trim()) { err.textContent = '👆 Give the step a name.'; return; }
              const r = E.add(acc, cid, { title: title.value, summary: summary.value, role: role.value, parents, children }); if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
              if (chapters.length || goals.value.trim()) E.update(acc, cid, r.id, { chapters, learningGoals: goals.value.split('\n') });
              else { busy.textContent = '⏳ The AI is planning its chapters…'; try { const pr = await E.plan(acc, cid, [r.id], { instruction: instr.value.trim() }); if (pr.queued) toast('💬 Your Claude app plans its chapters — copy the message from the 💬 bar.', 4500); } catch (e) { toast('⚠️ Chapters not planned: ' + e.message, 5000); } }
              close(); onDone(r.id); } }, '➕ Add the step')]
          : [el('button', { class: 'btn primary', onclick: () => { if (save()) { close(); onDone(); toast('✔ Saved'); } } }, 'Save'),
            el('button', { class: 'btn small danger', onclick: async () => {
              const bridge = confirm(`Remove “${n.title}” from the Roadmap?\n\nOK = its prerequisites become prerequisites of the steps after it (keeps the order).\nCancel = do not remove.`); if (!bridge) return;
              const delMat = n.pack?.id && !n.pack.assigned && !C().stepsOf(acc, n.pack.id).some(x => x.c.id !== cid || x.nid !== id) ? confirm('Also delete the material already prepared for this step?\nOK = delete it · Cancel = keep it as a normal subject') : false;
              await E.remove(acc, cid, id, { bridge: true, deleteMaterial: delMat }); close(); onDone(null); toast('🗑 Step removed'); } }, '🗑 Remove the step')];
      box.append(head2,
        el('div', { class: 'noema-form' },
          el('label', { class: 'cg-field' }, 'Name', title), el('label', { class: 'cg-field' }, 'What it teaches', summary), el('label', { class: 'cg-field' }, 'Place in the Roadmap', role),
          el('div', { class: 'cg-field' }, el('b', {}, '⬅️ Prerequisites (must be mastered first)'), links('prerequisite', () => parents, v => { parents = v; }, possibleP)),
          el('div', { class: 'cg-field' }, el('b', {}, '➡️ Opens these steps'), links('dependent step', () => children, v => { children = v; }, possibleK)),
          ownField(),
          n && !n.pack?.assigned && !locked ? el('div', { class: 'cg-field' }, el('b', {}, '📎 Your material for this step'), tip('Files you give a step are its sources: its chapters are planned from them and its subject is built from them (with Claude: inside its sandbox; with Gemini: from their text) — no web research of the theory. Steps without files are researched as usual.'), matBox) : null,
          // a prepared step's goals and chapters are fixed: not shown here (only what can change is)
          locked ? null : el('label', { class: 'cg-field' }, 'Learning goals', goals),
          locked ? null : el('div', { class: 'cg-field' }, el('b', {}, '📖 Chapters'), chBox,
            el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { chapters.push({ title: '', goals: [], coverage: [] }); drawCh(); chBox.querySelector('li:last-child input')?.focus(); } }, '➕ Add a chapter'), replan),
            instr),
          busy),
        err, el('div', { class: 'row noema-ovfoot' }, ...buttons, el('button', { class: 'btn small', onclick: close }, 'Cancel')));
      setTimeout(() => (mode === 'review' ? box.querySelector('.cm-chedit input') : title)?.focus(), 150);
    });
  }
  /** A step's summary without the names and pages of its files (the 📎 next to the title has them); what stays, when it is
      short (e.g. “Path C”, “Foundations”), is shown next to the kind of step. → { path, summary } */
  const FILEISH = /\.(pdf|md|markdown|txt|docx?|pptx?|zip|html?|epub|ipynb)\b|\bpp?\.\s*\d|\bσσ?\.\s*\d|\d+\s*(pages?|σελ)|📎/i;
  function splitSummary(text) {
    const parts = String(text || '').split(/\s+[·|]\s+/).map(x => x.trim()).filter(Boolean), keep = parts.filter(x => !FILEISH.test(x));
    if (keep.length === parts.length) return { path: '', summary: String(text || '').trim() };
    const rest = keep.join(' · ');
    return rest.length <= 48 && !/[.!?;](\s|$)/.test(rest) ? { path: rest, summary: '' } : { path: '', summary: rest };
  }
  async function openMaterial(acc, cid, id, f) {
    const c = C().get(acc, cid); const rec = await C().materialFile(acc, c, id, f).catch(() => null);
    if (!rec?.blob) { toast('⚠️ This file is not on this device and could not be downloaded.', 4000); return; }
    window.NoemaViewer.open({ blob: rec.blob, name: f.name, type: rec.type, title: f.name, subtitle: c.nodes[id]?.title + (f.range ? ` · pages ${f.range[0]}–${f.range[1]}` : ''), page: f.range ? f.range[0] : undefined });
  }

  /** 📚 The sources of a step: the learner's own files (at the step's pages) and the sources of the subject prepared for it. */
  function stepSources(acc, cid, id) {
    const c = C().get(acc, cid), n = c?.nodes[id]; if (!n) return;
    const files = n.material?.files || [], pk = n.pack || {}, SF = window.NoemaSrcFiles;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-srcbox');
      const list = el('div', { class: 'cm-srclist' });
      const row = (ic, title, sub, open) => el('button', { class: 'cm-srcrow', disabled: open ? null : true, onclick: open }, el('span', { class: 'cm-srcic', 'aria-hidden': 'true' }, ic),
        el('span', { class: 'grow' }, el('b', {}, title), sub ? el('small', {}, sub) : null), open ? el('span', { class: 'cm-srceye', 'aria-hidden': 'true' }, '👁') : null);
      box.append(el('div', { class: 'row cm-srchead' }, el('h3', { class: 'grow' }, '📚 ' + SL('stepSources', 'Sources of this step')), el('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: close }, '✕')),
        el('p', { class: 'tiny' }, n.title), list);
      for (const f of files) list.append(row('📎', f.name, f.range ? SL('srcPages', 'pages {p}', { p: `${f.range[0]}–${f.range[1]}` }) : '', () => openMaterial(acc, cid, id, f)));
      const empty = () => { if (!list.children.length) list.append(el('p', { class: 'tiny' }, SL('noSources', 'No sources yet. They show here once the step is prepared.'))); };
      if (!(pk.id && pk.status === 'ready')) return empty();
      const wait = el('p', { class: 'tiny' }, '⏳'); list.append(wait);
      Promise.resolve(window.Noema.loadSubject?.(acc, pk.id)).catch(() => null).then(p => {
        wait.remove(); const R = p?.sources || {};
        for (const s of R.sources || []) {
          if (files.some(f => f.srcId === s.id)) continue;   // already listed, with the step's pages
          const chs = (p.chapters || []).filter(ch => (R.chapters?.[ch.id] || ch.src) === s.id || (ch.sources || []).some(x => x.id === s.id)).map(ch => ch.title);
          const av = SF?.available(acc, pk.id, s);
          list.append(row(s.emoji || '📘', s.title, [s.pages, chs.join(' · '), av ? '' : SL('srcNoFile', 'no file on this device')].filter(Boolean).join(' · '), av ? () => openSrc(acc, pk.id, s, av) : null));
        }
        empty();
      });
    });
  }
  async function openSrc(acc, sid, s, av) {
    if (av.url && !av.meta) return window.NoemaViewer.open({ url: av.url, title: s.title, subtitle: s.subtitle });
    const rec = await window.NoemaSrcFiles.get(acc, sid, s.id).catch(() => null);
    if (!rec?.blob) { toast('⚠️ This file is not on this device and could not be downloaded.', 4000); return; }
    window.NoemaViewer.open({ blob: rec.blob, name: rec.name, type: rec.type, title: s.title, subtitle: s.subtitle });
  }

  /* ======================= 📥 import a map you already have ======================= */
  function importMap(acc, { onStudy } = {}) {
    const I = window.NoemaCurImport;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-import');
      let parsed = null, aiParsed = null, files = [], sel = null, filter = 'all', dragging = null;
      const A = new Map();   // file → { targets: [{ id, range }], how, confidence, alts, manual }
      const text = el('textarea', { class: 'noema-input cm-maptext', rows: 12, spellcheck: 'false', placeholder: 'Paste your map — a tree like\nCell biology\n├── Prerequisites\n├── Membranes\n│   └── Transport\n└── Applications\n\n…arrows (Algebra → Calculus), a Mermaid graph or JSON.\nⓘ above shows every form, with examples.' });
      const fileIn = el('input', { type: 'file', accept: '.txt,.md,.markdown,.json,.mmd,.mermaid', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (f) { text.value = await f.text(); aiParsed = null; reparse(); } } });
      const mode = el('select', { class: 'noema-input', onchange: () => reparse() }, el('option', { value: 'sequence' }, 'in the order written (each after the previous one)'), el('option', { value: 'parallel' }, 'in any order (each after its parent topic)'));
      const reverse = el('input', { type: 'checkbox', onchange: () => reparse() }), keepCaps = el('input', { type: 'checkbox', onchange: () => reparse() });
      const info = el('div', { class: 'tiny cm-detect' }), perr = el('div', { class: 'tiny cg-kstat bad' }), warnBox = el('div', { class: 'tiny cm-warns' });
      const graph = el('div', { class: 'cm-miniscroll', 'aria-label': 'Preview of the Roadmap' }), nodeBox = el('div', { class: 'cm-nodebox' }), prev = el('ol', { class: 'cm-preview' });
      const title = el('input', { class: 'noema-input', placeholder: 'Name of the Roadmap' });
      const lang = el('select', { class: 'noema-input' }, ...Object.entries(C().LANG).map(([v, t]) => el('option', { value: v }, t))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: 'Optional: what you already know' });
      const PP = providerPick(acc, { what: 'plans the chapters of your steps and prepares each step as a subject (from your files, when the step has some)' }), provider = PP.sel;
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} step${n > 1 ? 's' : ''} ahead` : 'only when I open a step'))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(prefs(acc).curBudget || 8) });
      const fileBox = el('div', { class: 'cm-files' }), fileSum = el('div', { class: 'tiny cm-filesum' });
      const attachFirst = el('input', { type: 'checkbox', class: 'cm-attachfirst' });
      const drop = el('label', { class: 'cg-drop' }, '📎 Add the material (PDF, Word, slides, notes… or a .zip)', el('input', { type: 'file', multiple: true, onchange: e => { addFiles([...e.target.files]); e.target.value = ''; } }));
      const folder = el('label', { class: 'btn small' }, '📁 Add a folder', el('input', { type: 'file', multiple: true, webkitdirectory: true, style: { display: 'none' }, onchange: e => { addFiles([...e.target.files].filter(f => !/(^|\/)\./.test(f.webkitRelativePath || f.name))); e.target.value = ''; } }));
      ['dragover', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); }));
      const aiBtn = el('button', { class: 'btn small ai', onclick: async () => {
        perr.textContent = ''; if (!text.value.trim()) { perr.textContent = '👆 Paste your Roadmap first.'; return; }
        if (!LLM().pick(acc, provider.value === 'claudeapp' ? 'auto' : provider.value)) { perr.textContent = '👆 Reading a Roadmap with AI needs a Claude API key or a Gemini key here (step 4). With the Claude app, write the Roadmap in one of the forms in ⓘ instead.'; return; }
        aiBtn.disabled = true; info.textContent = '✨ The AI is reading your Roadmap…';
        try { aiParsed = await I.aiRead(acc, text.value, { provider: provider.value, onLog: m => { info.textContent = m; } }); show(aiParsed); } catch (e) { perr.textContent = '⚠️ ' + e.message; info.textContent = ''; }
        aiBtn.disabled = false;
      } }, '✨ Let the AI read it');
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('div', { class: 'tiny' });
      const FMT = { outline: 'tree / outline', arrows: 'arrows', mermaid: 'Mermaid graph', json: 'JSON', ai: 'read by the AI' };
      const T = id => parsed?.nodes[id]?.title || id;
      const nFiles = id => [...A.values()].filter(a => a.targets.some(t => t.id === id)).length;
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const fmtRange = r => r ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : '';
      const addTarget = (f, id) => { const a = A.get(f); if (!a || a.targets.some(t => t.id === id)) return; a.targets.push({ id, range: null }); a.manual = true; a.confidence = 'high'; a.how = a.how || 'you'; redraw(); };

      /* ---- the map as a picture: branches and joins are visible; drop a file on a step ---- */
      function drawGraph() {
        graph.innerHTML = ''; if (!parsed) return;
        const Lt = C().layout({ nodes: parsed.nodes, edges: parsed.edges }); const NW = 158, NH = 44, GX = 30, GY = 10;
        const rows = Math.max(1, ...Lt.cols.map(c => c.length)); const Wd = Lt.cols.length * (NW + GX) + 8, Hd = rows * (NH + GY) + 8;
        const P = {}; Lt.cols.forEach((col, x) => { const off = (rows - col.length) * (NH + GY) / 2; col.forEach((id, y) => { P[id] = { x: 4 + x * (NW + GX), y: 4 + off + y * (NH + GY) }; }); });
        const inner = el('div', { class: 'cm-mini', style: { width: Wd + 'px', height: Hd + 'px' } });
        const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd); svg.setAttribute('class', 'cm-edges');
        for (const e of parsed.edges) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; const p = document.createElementNS(NS, 'path'); const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2; p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); if (sel && (e.from === sel || e.to === sel)) p.setAttribute('class', 'hl'); svg.append(p); }
        inner.append(svg);
        for (const id of parsed.order) {
          const n = parsed.nodes[id], k = nFiles(id), ins = parsed.edges.filter(e => e.to === id).length, outs = parsed.edges.filter(e => e.from === id).length;
          const b = el('button', { class: 'cm-mnode cm-r-' + n.role + (sel === id ? ' sel' : '') + (k ? ' has' : ''), 'data-id': id, style: { left: P[id].x + 'px', top: P[id].y + 'px', width: NW + 'px', height: NH + 'px' }, title: `${n.title}${ins > 1 ? ' · needs ' + ins + ' steps (join)' : ''}${outs > 1 ? ' · opens ' + outs + ' steps (branch)' : ''}\n${k ? '📎 ' + k + ' file(s)' : 'no files — researched by the AI'}\nDrop a file here to give it to this step`,
            onclick: () => { sel = sel === id ? null : id; drawGraph(); drawNode(); },
            ondragover: e => { e.preventDefault(); b.classList.add('over'); }, ondragleave: () => b.classList.remove('over'),
            ondrop: e => { e.preventDefault(); b.classList.remove('over'); const raw = e.dataTransfer.getData('text/noema-file') || e.dataTransfer.getData('text/plain'); const i = /^\d+$/.test(raw) ? +raw : (dragging ?? -1); dragging = null; if (files[i]) addTarget(files[i], id); else if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], id); } },
            el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, n.title), k ? el('span', { class: 'cm-mbadge' }, '📎' + k) : null);
          inner.append(b);
        }
        graph.append(inner);
      }
      /* ---- the selected step: its files (pages per step), add one ---- */
      function drawNode() {
        nodeBox.innerHTML = ''; if (!parsed || !sel || !parsed.nodes[sel]) return;
        const mine = [...A.entries()].filter(([, a]) => a.targets.some(t => t.id === sel));
        const add = el('select', { class: 'noema-input', 'aria-label': 'Give a file to this step', onchange: e => { const f = files[+e.target.value]; if (f) addTarget(f, sel); } }, el('option', { value: '' }, files.length ? '＋ Give it a file…' : 'Add files below first'), ...files.map((f, i) => el('option', { value: i }, relPath(f))));
        nodeBox.append(el('div', { class: 'cm-nodehead' }, el('b', {}, '📎 ' + T(sel)), el('button', { class: 'btn small ghost', 'aria-label': 'Close', onclick: () => { sel = null; redraw(); } }, '✕')),
          mine.length ? el('ul', { class: 'cm-matlist' }, ...mine.map(([f, a]) => { const t = a.targets.find(x => x.id === sel); return el('li', {}, '📄 ' + relPath(f), rangeInput(f, t), el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name + ' from this step', onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕')); }))
            : el('div', { class: 'tiny' }, 'No files — the AI will research this step (or drop a file on it).'), add);
      }
      const rangeInput = (f, t) => el('label', { class: 'tiny cm-rangel' }, ' pages ', el('input', { class: 'noema-input cm-range', value: fmtRange(t.range), placeholder: 'all', 'aria-label': `Pages of ${f.name} for “${T(t.id)}”`, onchange: e => { t.range = parseRange(e.target.value); A.get(f).manual = true; } }));
      const relPath = f => String(f.hint || f.webkitRelativePath || f.name);

      function show(g) {
        parsed = g; prev.innerHTML = ''; perr.textContent = ''; warnBox.innerHTML = '';
        if (sel && !(g && g.nodes[sel])) sel = null;
        if (!g) { info.textContent = ''; redraw(); return; }
        const s = g.stats || {}; const planned = Object.values(g.nodes).filter(n => n.chapters?.length).length;
        info.textContent = `✓ ${FMT[g.format] || g.format}: ${s.steps} steps · ${s.links} links` + (s.branches ? ` · ${s.branches} branch${s.branches > 1 ? 'es' : ''}` : '') + (s.joins ? ` · ${s.joins} join${s.joins > 1 ? 's' : ''}` : '') + (s.starts > 1 ? ` · ${s.starts} starting points` : '') + (planned ? ` · ${planned} with their chapters` : '') + (s.named ? ` · files named for ${s.named} step(s)` : '');
        if (g.warnings.length) warnBox.append(...g.warnings.slice(0, 6).map(w => el('div', {}, '⚠️ ' + w)));
        if (!title.value.trim() || title.dataset.auto) { title.value = g.title || ''; title.dataset.auto = '1'; }
        if (g.language && C().LANG[g.language]) lang.value = g.language;
        g.order.forEach(id => { const ps = g.edges.filter(e => e.to === id).map(e => T(e.from)); prev.append(el('li', {}, el('span', { class: 'cm-ic' }, ICON[g.nodes[id].role] || '•'), ' ', el('b', {}, T(id)), ps.length ? el('span', { class: 'tiny' }, '  ← ' + ps.join(', ')) : el('span', { class: 'tiny' }, '  (starts here)'))); });
        rematch(); redraw();
      }
      let t0 = null;
      function reparse() {
        clearTimeout(t0); t0 = setTimeout(() => {
          if (!text.value.trim()) { show(null); return; }
          if (aiParsed) { show(aiParsed); return; }
          try { show(I.parse(text.value, { mode: mode.value, reverse: reverse.checked, keepCaps: keepCaps.checked })); }
          catch (e) { parsed = null; prev.innerHTML = ''; info.textContent = ''; perr.textContent = '⚠️ ' + e.message + (LLM().pick(acc, provider.value) ? ' — or tap ✨ Let the AI read it.' : ''); redraw(); }
        }, 250);
      }
      text.addEventListener('input', () => { aiParsed = null; reparse(); }); title.addEventListener('input', () => { delete title.dataset.auto; });
      /** automatic matches for the files the learner has not touched (their own choices stay) */
      function rematch() {
        if (!files.length) return;
        const auto = parsed ? I.matchFiles(parsed, files) : files.map(f => ({ file: f, targets: [], confidence: 'none', alts: [] }));
        for (const m of auto) { const a = A.get(m.file); if (a?.manual) { if (parsed) a.targets = a.targets.filter(t => parsed.nodes[t.id]); continue; } A.set(m.file, { targets: m.targets.map(t => ({ ...t })), how: m.targets[0]?.how || '', confidence: m.confidence, alts: m.alts || [], manual: false }); }
      }
      async function addFiles(fs, toStep) {
        const added = [];
        for (const f of fs) {
          if (/\.zip$/i.test(f.name)) { try { const inner = await I.unzipMaterial(f); for (const g of inner) if (!files.some(x => relPath(x) === relPath(g) && x.size === g.size)) { files.push(g); added.push(g); } } catch (e) { toast('⚠️ ' + f.name + ': ' + e.message, 4000); } continue; }
          if (!files.some(x => relPath(x) === relPath(f) && x.size === f.size)) { files.push(f); added.push(f); }
        }
        rematch();
        if (toStep) for (const f of added) addTarget(f, toStep);
        redraw();
      }
      const BADGE = { high: ['✓', 'sure'], medium: ['≈', 'likely'], low: ['?', 'guess — check'], check: ['⚠️', 'check: more than one step fits'], none: ['—', 'not used'] };
      const HOW = { map: 'named in your Roadmap', folder: 'by its folder', number: 'by its number', name: 'by its name', you: 'by you' };
      function drawFiles() {
        fileBox.innerHTML = ''; fileSum.textContent = '';
        if (!files.length) return;
        const all = files.map((f, i) => ({ f, i, a: A.get(f) || { targets: [], confidence: 'none', alts: [] } }));
        const unused = all.filter(x => !x.a.targets.length), check = all.filter(x => x.a.targets.length && (x.a.confidence === 'check' || x.a.confidence === 'low') && !x.a.manual);
        const stepsWith = parsed ? parsed.order.filter(id => nFiles(id)).length : 0;
        fileSum.textContent = `${files.length} file(s) · ${stepsWith}/${parsed ? parsed.order.length : 0} steps have files` + (check.length ? ` · ⚠️ ${check.length} to check` : '') + (unused.length ? ` · ${unused.length} not used` : '');
        const tabs = el('div', { class: 'cm-filetabs', role: 'tablist' }, ...[['all', `All ${all.length}`], ['check', `⚠️ To check ${check.length}`], ['unused', `Not used ${unused.length}`]].map(([k, l]) => el('button', { class: 'fchip' + (filter === k ? ' on' : ''), role: 'tab', onclick: () => { filter = k; drawFiles(); } }, l)));
        const rows = (filter === 'check' ? check : filter === 'unused' ? unused : all);
        fileBox.append(tabs, el('table', { class: 'cm-filetable' }, el('tbody', {}, ...rows.map(({ f, i, a }) => {
          const conf = a.manual ? ['✓', 'set by you'] : BADGE[a.confidence] || BADGE.none;
          const chips = el('div', { class: 'cm-chips' }, ...a.targets.map(t => el('span', { class: 'cm-tchip' }, el('button', { class: 'linklike', onclick: () => { sel = t.id; redraw(); graph.querySelector(`[data-id="${CSS.escape(t.id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); } }, T(t.id)), rangeInput(f, t),
            el('button', { class: 'btn small ghost', 'aria-label': `Remove ${f.name} from “${T(t.id)}”`, onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕'))));
          const addSel = el('select', { class: 'noema-input cm-addstep', 'aria-label': (a.targets.length ? 'Another step for ' : 'Step for ') + f.name, onchange: e => { if (e.target.value) addTarget(f, e.target.value); } },
            el('option', { value: '' }, a.targets.length ? '＋ also for…' : '— choose a step —'), ...(parsed ? parsed.order.filter(id => !a.targets.some(t => t.id === id)).map(id => el('option', { value: id }, T(id))) : []));
          const alts = !a.manual && a.alts?.length ? el('div', { class: 'tiny' }, 'or: ', ...a.alts.map((id, k) => [k ? ', ' : '', el('button', { class: 'linklike', onclick: () => { a.targets = [{ id, range: null }]; a.manual = true; redraw(); } }, T(id))])) : null;
          return el('tr', { draggable: 'true', ondragstart: e => { dragging = i; e.dataTransfer.setData('text/noema-file', String(i)); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'copy'; }, ondragend: () => { setTimeout(() => { dragging = null; }, 0); } },
            el('td', {}, el('span', { class: 'cm-conf c-' + (a.manual ? 'high' : a.confidence), title: conf[1] }, conf[0]), ' 📄 ', el('b', {}, f.name), el('div', { class: 'tiny' }, relPath(f) !== f.name ? relPath(f).replace(/[^/]+$/, '') + ' · ' : '', (f.size / 1048576).toFixed(1) + ' MB' + (a.targets.length ? ' · ' + (a.manual ? HOW.you : HOW[a.how] || '') : ''))),
            el('td', {}, chips, alts, addSel),
            el('td', {}, el('button', { class: 'btn small ghost', 'aria-label': 'Remove ' + f.name, onclick: () => { files = files.filter(x => x !== f); A.delete(f); redraw(); } }, '✕')));
        }))));
      }
      function redraw() { drawGraph(); drawNode(); drawFiles(); }
      const go = el('button', { class: 'btn primary cg-go', onclick: async () => {
        err.textContent = '';
        if (!parsed) { err.textContent = '👆 Paste a Roadmap that can be read (step 1).'; return; }
        const needPlan = Object.values(parsed.nodes).some(n => !n.chapters?.length);
        if (needPlan && provider.value !== 'claudeapp' && !LLM().pick(acc, provider.value)) { err.textContent = '👆 Planning the chapters needs a Claude API key or a Gemini key (step 4) — or choose the Claude app.'; return; }
        const big = files.find(f => f.size > (window.NoemaSrcFiles?.MAX || 2147483648)); if (big) { err.textContent = `⚠️ ${big.name} is too big for a browser to keep (over 2 GB).`; return; }
        go.disabled = true;
        try {
          const assignments = files.map(f => ({ file: f, targets: (A.get(f)?.targets || []).filter(t => parsed.nodes[t.id]) })).filter(a => a.targets.length);
          let c = await I.create(acc, parsed, { title: title.value.trim(), language: lang.value, learner: learner.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8), assignments, source: text.value, onLog: m => { busy.textContent = m; } });
          if (attachFirst.checked) {   // 📦 open the map and attach the learner's own subjects first; the other steps are planned afterwards (▶ Plan the steps now)
            c.attachFirst = true; if (C().holding(c)) { c.status = c.provider === 'claudeapp' ? 'ready' : 'attach'; } C().save(acc, c); c = C().get(acc, c.id);
            if (C().holding(c)) { close(); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); map(acc, c.id, { onStudy }); setTimeout(() => attachMany(acc, c.id), 350); return; }
          }
          if (c.provider === 'claudeapp') { const r = await C().build(acc, c); close(); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); G().kick(); map(acc, r.id, { onStudy, appHelp: !J().work(r).done }); return; }
          close(); if (c.status === 'ready') { G().kick(); map(acc, c.id, { onStudy }); } else progress(acc, c, { onStudy, start: true });
        } catch (e) { err.textContent = '⚠️ ' + e.message; go.disabled = false; }
      } }, '📥 Import my Roadmap');
      // ⓘ guides (step 1: how to write a map · step 3: how to give steps their files) — every example is read by the real parser
      const tryIt = code => el('button', { class: 'btn small ghost cm-try', onclick: e => { e.preventDefault(); text.value = code; aiParsed = null; reparse(); text.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, '▶ Try it');
      const rules = rows => el('table', { class: 'cm-rules' }, el('tbody', {}, ...rows.map(([c, m]) => el('tr', {}, el('td', {}, el('code', {}, c)), el('td', {}, m)))));
      const ex = (code, reads) => el('div', { class: 'cm-ex' }, el('pre', {}, code), reads ? el('div', { class: 'cm-reads' }, el('b', {}, 'Read as: '), el('pre', {}, reads)) : null, tryIt(code));
      const sec = (h, ...c) => el('section', { class: 'cm-gsec' }, el('h4', {}, h), ...c);
      const mapGuide = el('div', { class: 'cm-guide' },
        el('p', {}, 'A Roadmap is your list of steps and which step needs which. Any shape works: a step may open several steps (a ', el('b', {}, 'branch'), ') and need several (a ', el('b', {}, 'join'), '). Only a circle of “needs” is refused (the steps on it are named). Write it in any of the forms below — the preview under the box shows how it was read, so you can check it at once. “A ⟵ B” below means “A needs B” (B is learned first).'),
        sec('1 · Tree or outline',
          rules([
            ['├── └── │   - * •   1.  2.3  a)   # ##   indentation', 'a topic written under another is its sub-topic'],
            ['(sub-topic)', 'comes after its parent topic; the next topic at the parent’s level waits for all of its sub-topics (a join)'],
            ['topics at the same level', 'in the order written: each needs the one before it. To make unnumbered levels independent everywhere: “How to read it” ▸ in any order'],
            ['1. 2. 3.   2.1 2.2', 'numbered topics always follow each other'],
            ['Topic (any order)', 'its sub-topics are independent: each needs only the parent (on the top line: the whole first level)'],
            ['Topic (in order)', 'its sub-topics follow each other, even when “any order” is the default'],
            ['Topic (after: A, 2.1)   Topic ← A', 'an extra link: it also needs A (by title or by number) — e.g. a join across two branches'],
            ['Topic — one line', 'a short description of what the step covers'],
            ['one top line with everything under it', 'the name of the course, not a step'],
            ['Prerequisites / Applications', 'top-level groups with these names come before / after the main topics, even in “any order”'],
            ['Topic 📎 file.pdf pp. 3–9', 'the files of this step (see ⓘ in step 3)']]),
          ex('Molecular biology\n├── Chemistry basics\n├── DNA (any order)\n│   ├── Structure\n│   └── Replication — how cells copy DNA\n├── Transcription\n└── Applications',
            '1 Chemistry basics   (start)\n2 DNA                ⟵ Chemistry basics\n2.1 Structure        ⟵ DNA\n2.2 Replication      ⟵ DNA      (independent of 2.1)\n3 Transcription      ⟵ Structure, Replication   (a join)\n4 Applications       ⟵ Transcription'),
          ex('Course (any order)\n- Algebra\n- Geometry\n- Calculus (after: Algebra, Geometry)',
            'Algebra    (start)\nGeometry   (start)\nCalculus   ⟵ Algebra, Geometry')),
        sec('2 · Arrows',
          rules([
            ['A → B     (also -> => ⇒)', 'B needs A: A comes first'],
            ['A → B → C', 'a chain'],
            ['A, B → C', 'a join: C needs both A and B'],
            ['A → B, C', 'a branch: B and C both need A (and not each other)'],
            ['one chain per line', 'the same title in several lines is the same step'],
            ['⇄ in “How to read it”', 'if your arrows point from a step to what it needs (C → A, B), reverse them'],
            ['A — one line   A 📎 a.pdf', 'a description / files on a step work here too']]),
          ex('Algebra → Calculus → Probability\nCalculus → Linear algebra\nProbability, Linear algebra → Bayesian inference',
            'Algebra             (start)\nCalculus            ⟵ Algebra\nProbability         ⟵ Calculus\nLinear algebra      ⟵ Calculus          (a branch from Calculus)\nBayesian inference  ⟵ Probability, Linear algebra   (a join)')),
        sec('3 · Mermaid',
          rules([
            ['flowchart LR   graph TD', 'the first line (the direction does not matter)'],
            ['A[Algebra]   A(Algebra)   A{Algebra}', 'a step: id A, title Algebra (any shape)'],
            ['A --> B    A ==> B    A -.-> B    A -- text --> B', 'B needs A (labels are ignored)'],
            ['B & C --> D', 'a join: D needs B and C'],
            ['subgraph Prerequisites … end', 'a group: its steps are marked as prerequisites (or applications…) — only arrows make links'],
            ['%% 📎 Files   then   %% D: proofs/', 'files by step id, in comment lines (Mermaid ignores them)']]),
          ex('flowchart LR\n  A[Algebra] --> B[Calculus]\n  A --> C[Logic]\n  B & C --> D[Proofs]',
            'Algebra    (start)\nCalculus   ⟵ Algebra\nLogic      ⟵ Algebra\nProofs     ⟵ Calculus, Logic')),
        sec('4 · JSON',
          rules([
            ['"nodes": [{ "id", "title", "after": [ids] }]', 'the steps; “after” may also be called prerequisites, requires, needs, dependsOn'],
            ['"edges": [{ "from": "a", "to": "b" }]   or   ["a → b"]', 'links instead of “after”: b needs a'],
            ['"children": [ … ]   "order": "any"', 'a nested tree, read like an outline'],
            ['"summary"   "files"   "folder"', 'a description and the files of a step: "files": ["book.pdf pp. 1-40"] or [{ "path": "book.pdf", "pages": "1-40" }], "folder": "bayes/"'],
            ['"files": { "<id or title>": ["path", …] }', 'all files at the top level instead'],
            ['a Roadmap exported from noema-lite', 'is imported as it is (with its chapters)']]),
          ex('{ "title": "Bayes",\n  "nodes": [\n    { "id": "prob", "title": "Probability" },\n    { "id": "lin", "title": "Linear algebra" },\n    { "id": "bayes", "title": "Bayesian inference", "after": ["prob", "lin"] } ] }',
            'Probability          (start)\nLinear algebra       (start)\nBayesian inference   ⟵ Probability, Linear algebra')),
        sec('5 · Anything else', el('p', {}, 'Prose, a table, a syllabus copied from a web page… press “✨ Let the AI read it”. It keeps only your Roadmap’s own topics (it may not add, drop or rename any) and you see the result before importing.')),
        el('p', { class: 'tiny' }, 'Links that other links already imply are dropped (A → B → C makes “C needs A” unnecessary). ALL-CAPS titles become normal capitalisation unless you tick “Keep CAPITALS”.'));
      const filesGuide = el('div', { class: 'cm-guide' },
        el('p', {}, 'A step with files is planned and taught FROM them (no web research of its theory); steps without files are researched by the AI as usual. Add files, a folder (📁, keeps its sub-folders) or a .zip — then each file is given to a step in this order:'),
        sec('1 · Named in your Roadmap (✓ sure)',
          rules([
            ['Topic 📎 book.pdf pp. 40–62, notes/dna/', 'on the step itself, after 📎 (comma-separated)'],
            ['Topic (files: lab/)', 'the same, without the emoji'],
            ['📎 Files   — a line of its own at the end', 'starts a files section: one line per step, “key: paths”'],
            ['DNA replication: …   2.1: …   D: …', 'the key is the step’s title, its outline number or its Mermaid / JSON id'],
            ['%% 📎 Files   %% D: proofs/', 'in Mermaid, as comment lines'],
            ['"files" / "folder"', 'in JSON (see ⓘ in step 1)']]),
          ex('1. Cell biology\n2. DNA replication 📎 dna/*.pdf, notes/dna.md\n3. Transcription\n\n📎 Files\nCell biology: cells/\n3: book.pdf pp. 40–62',
            'Cell biology      📎 every file in cells/\nDNA replication   📎 the PDFs in dna/ + notes/dna.md\nTranscription     📎 pages 40–62 of book.pdf')),
        sec('2 · Paths',
          rules([
            ['book.pdf', 'that file, wherever it is in what you added (add its folder to be precise: dna/book.pdf)'],
            ['dna/   (or dna)', 'a folder: every file in it, at any depth'],
            ['notes/*.md   lab?/x.pdf   dna/**', '* any name, ? one character, ** any sub-folders'],
            ['book.pdf pp. 40–62   p. 40   #40-62   σσ. 40–62', 'only these pages of a PDF belong to the step'],
            ['the same book in several steps', 'name it on each with its pages — one textbook can serve the whole Roadmap and is stored once']])),
        sec('3 · Not named? Matched automatically',
          rules([
            ['DNA replication/   03 DNA replication/   2.1/', '≈ a sub-folder named like a step (at any depth) → every file in it'],
            ['2.1 Structure.pdf   03-transcription.pdf', '≈ a name that starts with the step’s number (or its position)'],
            ['transcription-notes.pdf', '? a name that looks like a step’s title — a guess, check it'],
            ['⚠️', 'more than one step fits — pick one (tab “⚠️ To check”)'],
            ['—', 'no step fits — tab “Not used”: give it a step or leave it out (it is not stored)']]),
          el('p', {}, 'A folder that holds everything (the folder you dropped, “material/”) is ignored when matching. A good layout: one sub-folder per step, named like the step or with its number.'),
          el('pre', { class: 'cm-tree' }, 'Biology/\n├── 01 Cell biology/        → step 1 (every file)\n├── 02 DNA replication/\n│   ├── lecture.pdf\n│   └── notes.md\n└── book.pdf               → named in the Roadmap with pages per step')),
        sec('4 · Change anything',
          el('p', {}, 'Tap a step chip to remove it, “＋ step” to give the file to one more step, type pages (40–62) next to a step, or drag a file onto a step in the Roadmap above. ✓ = set by you. Files can also be added later: ✏️ Edit step → 📎, until the step is prepared.')));
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); library(acc, { onStudy }); } }, '← Roadmaps'),
        head('📥 Import a Roadmap', 'Your own Roadmap of steps becomes the Roadmap as it is — no AI redraws it. Give steps their files and they are taught from them.'),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Your Roadmap'), tip(mapGuide)),
            text, el('div', { class: 'row' }, el('label', { class: 'btn small' }, '📄 Open a file', fileIn), aiBtn),
            el('details', { class: 'cg-faq' }, el('summary', {}, 'How to read it'), el('label', { class: 'cg-field' }, 'Topics at the same level (when not numbered and not marked)', mode), el('label', { class: 'tiny' }, reverse, ' ⇄ my arrows point from a step to what it needs (reverse them)'), el('label', { class: 'tiny' }, keepCaps, ' Keep CAPITALS as written')),
            info, perr, warnBox, graph, nodeBox, el('details', { class: 'cg-faq' }, el('summary', {}, 'The steps as a list'), prev)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Name and language')), el('label', { class: 'cg-field' }, 'Name', title), el('label', { class: 'cg-field' }, 'Language of the course', lang), el('label', { class: 'cg-field' }, 'Your starting point', learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Material of the steps (optional)'), tip(filesGuide)), drop, el('div', { class: 'row' }, folder), fileSum, fileBox),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Which AI plans and prepares the steps?'), tip(el('div', {}, el('p', {}, 'The Roadmap is used as it is. The AI only plans the chapters of each step (from its files, when it has some) and later prepares each step as a subject.'), el('p', {}, el('b', {}, '💬 Claude app (recommended): '), 'nothing more to do in this form — press Import. The Roadmap opens with a 💬 bar: copy its message into a chat of your Claude app (or claude.ai); Claude plans the chapters and prepares the steps that wait in its queue, one per chat, and they appear here by themselves. Your files are given to Claude through the connector (or in a bundle you download, without it). Usually the cheapest way — no cost beyond your Claude plan, which matters most for big Roadmaps.'), el('p', {}, el('b', {}, 'API key / Gemini: '), 'the work runs here, in the background while the app is open.')))), PP.box,
            el('label', { class: 'cg-field' }, 'Prepare ahead', prefetch), el('label', { class: 'cg-field' }, 'Claude API key: stop and ask me when one step costs more than $', budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Use subjects you already have (optional)'), tip('Steps you attach one of your subjects to are planned from that subject and never generated — no agent touches them. You can also do it later, on any step: 📦 Use a subject I have.')),
            el('label', { class: 'tiny' }, attachFirst, ' Open the Roadmap first so I can attach my subjects to its steps — then the other steps are planned')),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, 'Import')), go, busy, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, 'Close')));
      setTimeout(() => text.focus(), 200);
    });
  }

  /* ======================= the map ======================= */
  const NW = 196, NH = 76, GX = 74, GY = 18, TOP = 64;
  /* the treasure map (a page of the shell): stations from the bottom (prerequisites) up to the goal; smaller nodes */
  const VW = 158, VH = 66, VGX = 26, VGY = 72, VTOP = 96;
  /** What the shell asks the next map it opens to do (e.g. { settings: true } from a Roadmap's ⋮). */
  const mapOpts = { next: null };
  const SHL = () => window.NoemaShell?.mounted ? window.NoemaShell : null;
  const SL = (k, d, v) => window.NoemaShell ? NoemaShell.L(k, v) : d;   // the shell's words (engine/i18n_shell.js), English without it
  const viewKey = 'noema-mapview';
  /** 🗺 The shell's treasure map (the design's Roadmap page): the steps in layers from the start (bottom) up to the treasure (top).
      A path that skips layers gets waypoints, each layer is ordered to cut crossings, then x relaxes towards the neighbours.
      → { X, Y(id), W, H, E: chains of ids (from … to), layers, T: the treasure's key, code: id → its short station code } */
  const TSEP = 118, TWAY = 60, TWW = 22, TM = 64, TLH = 124, TTOP = 118, TFOOT = 96;
  function treasureLayout(c) {
    const L0 = C().layout(c), T = '⚑treasure', ids = Object.keys(c.nodes);
    const layers = L0.cols.filter(col => col.length).map(col => [...col]), L = {};
    layers.forEach((l, i) => l.forEach(id => L[id] = i));
    const kids = {}; ids.forEach(id => kids[id] = 0);
    const links = c.edges.filter(e => L[e.from] != null && L[e.to] > L[e.from]); links.forEach(e => kids[e.from]++);
    const sinks = ids.filter(id => !kids[id] && L[id] != null);
    layers.push([T]); L[T] = layers.length - 1;
    const way = {}, E = [], up = {}, dn = {};
    const node = id => { if (!up[id]) { up[id] = []; dn[id] = []; } };
    [...links, ...sinks.map(s => ({ from: s, to: T }))].forEach((e, k) => {
      const chain = [e.from];
      for (let l = L[e.from] + 1; l < L[e.to]; l++) { const w = `⚑w${k}_${l}`; way[w] = 1; L[w] = l; layers[l].push(w); chain.push(w); }
      chain.push(e.to); E.push(chain);
      chain.forEach(node); chain.slice(1).forEach((b, i) => { up[b].push(chain[i]); dn[chain[i]].push(b); });
    });
    layers.flat().forEach(node);
    const nl = layers.length, pos = () => { const P = {}; layers.forEach(l => l.forEach((id, i) => P[id] = i)); return P; };
    const crossings = () => { const P = pos(); let n = 0;
      for (let l = 0; l < nl - 1; l++) { const seg = []; layers[l].forEach(a => dn[a].forEach(b => seg.push([P[a], P[b]])));
        for (let i = 0; i < seg.length; i++) for (let j = i + 1; j < seg.length; j++) if ((seg[i][0] - seg[j][0]) * (seg[i][1] - seg[j][1]) < 0) n++; }
      return n; };
    let best = layers.map(l => [...l]), bestN = crossings();
    for (let it = 0; it < 16 && bestN; it++) {
      const down = it % 2 === 0, P0 = pos(), order = down ? [...Array(nl).keys()].slice(1) : [...Array(nl).keys()].reverse().slice(1);
      order.forEach(l => { const nb = down ? up : dn, Q = pos(); const bc = id => nb[id].length ? nb[id].reduce((s, x) => s + Q[x], 0) / nb[id].length : Q[id];
        layers[l].sort((a, b) => bc(a) - bc(b) || P0[a] - P0[b]); });
      const n = crossings(); if (n < bestN) { bestN = n; best = layers.map(l => [...l]); }
    }
    best.forEach((l, i) => layers[i] = l);
    const sep = (a, b) => way[a] && way[b] ? TWW : way[a] || way[b] ? TWAY : TSEP;
    const need = l => l.slice(1).reduce((s, id, i) => s + sep(l[i], id), 0);
    const W = Math.max(380, Math.ceil(Math.max(...layers.map(need)) + 2 * TM)), X = {};
    layers.forEach(l => { let x = W / 2 - need(l) / 2; l.forEach((id, i) => { if (i) x += sep(l[i - 1], id); X[id] = x; }); });
    const fit = l => { const xs = l.map(id => X[id]);
      for (let i = 1; i < l.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + sep(l[i - 1], l[i]));
      if (xs[l.length - 1] > W - TM) xs[l.length - 1] = W - TM;
      for (let i = l.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - sep(l[i], l[i + 1]));
      if (xs[0] < TM) { xs[0] = TM; for (let i = 1; i < l.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + sep(l[i - 1], l[i])); }
      l.forEach((id, i) => X[id] = xs[i]); };
    layers.forEach(fit);
    for (let it = 0; it < 24; it++) (it % 2 ? [...layers].reverse() : layers).forEach(l => { l.forEach(id => { const nb = [...up[id], ...dn[id]]; if (nb.length) X[id] = (X[id] + 2 * nb.reduce((s, x) => s + X[x], 0) / nb.length) / 3; }); fit(l); });
    const real = layers.flat().filter(k => !way[k]).map(k => X[k]), shift = W / 2 - (Math.min(...real) + Math.max(...real)) / 2;
    const lo = Math.min(...Object.values(X)), hi = Math.max(...Object.values(X)), sh = Math.max(16 - lo, Math.min(W - 16 - hi, shift));   // centre the stations; paths may run near the border
    Object.keys(X).forEach(k => X[k] += sh);
    const H = TTOP + (nl - 1) * TLH + TFOOT, Y = id => H - TFOOT - L[id] * TLH;
    // station codes: 1, 2, 3 … from the start upwards, left to right
    const code = {}; let k = 0; layers.forEach(l => [...l].filter(id => c.nodes[id]).sort((a, b) => X[a] - X[b]).forEach(id => code[id] = String(++k)));
    return { X, Y, W, H, E, L, layers, T, way, code, sinks };
  }
  /** opts.page: draw into this element (a page of the shell) instead of a full-screen overlay; opts.chrome(menu): the page's ⋮ */
  function map(acc, cid, { focus, onStudy, appHelp = false, page = null, chrome = null, settings: openSettings = false } = {}) {
    let c = C().get(acc, cid); if (!c) { toast?.('That Roadmap is not on this device yet.'); return; }
    G().start(acc); window.NoemaCurJobs?.App.start(acc);
    if (c.shared && !c.shared.ended) SH()?.refresh(acc, cid).then(() => SH().prefetch(acc, cid)).catch(e => console.warn('[curshare]', e.message));   // 👥 who prepared what, the owner's newest map
    const frame = page ? (build => { page.replaceChildren(); const box = el('div', { class: 'cm-full cm-page' }); page.append(box); build(box, () => { }); window.Noema?.plain?.watch(box); }) : (build => overlay(build));
    const toLibrary = () => page ? SHL()?.go('#/learn') : library(acc, { onStudy });
    frame((box, close) => {
      if (!page) { box.classList.add('cm-full'); box.parentElement.classList.add('cm-ov'); }
      const phone = matchMedia('(max-width: 720px)').matches;
      const vert = !!page;   // the shell's map grows upwards, like a path to a treasure
      let zoom = phone && !vert ? 0.78 : 1, sel = focus || null, fitted = false;
      let listMode = (() => { try { return page && localStorage.getItem(viewKey) === 'list'; } catch (e) { return false; } })();
      const sum = el('div', { class: 'cm-sum' }); const scroller = el('div', { class: 'cm-scroll' }); const canvas = el('div', { class: 'cm-canvas' }); scroller.append(canvas);
      const panel = el('aside', { class: 'cm-panel', 'aria-live': 'polite' });
      const appBar = el('div', { class: 'cm-appbar', role: 'status' });
      const holdBar = el('div', { class: 'cm-holdbar', role: 'status' });   // 📦 the map waits for the learner's own subjects before its steps are planned
      const drawHold = () => {
        holdBar.innerHTML = ''; if (!C().holding(c)) return;
        const k = Object.values(c.nodes).filter(n => n.pack?.assigned).length;
        holdBar.append(el('span', { class: 'grow' }, '📦 ', el('b', {}, 'Before its steps are planned: '), 'attach the subjects you already have to the steps they teach.' + (k ? ` ${k} attached so far.` : '')),
          el('button', { class: 'btn small primary cm-attachsubs', onclick: () => attachMany(acc, cid, { onDone: () => drawMap() }) }, '📦 Attach subjects'),
          el('button', { class: 'btn small cm-plannow', onclick: () => { close(); planNow(acc, cid, { onStudy }); } }, '▶ Plan the steps now'));
      };
      const member = SH()?.isMember(c);   // 👥 someone shared this curriculum with me: the map is theirs, my progress is mine
      const shareBar = el('div', { class: 'cm-sharebar', role: 'status' });
      const drawShareBar = () => {
        shareBar.innerHTML = ''; const sh = c.shared; if (!sh) return;
        if (sh.ended) { shareBar.append(el('span', {}, '👥 No longer shared with you — your copy of the Roadmap and the steps you have stay yours.')); return; }
        const R = Object.values(c.remote || {}), ready = R.filter(x => x.status === 'ready').length, busyN = R.filter(x => x.status === 'preparing' && !x.mine).length;
        shareBar.append(el('span', { class: 'grow' }, '👥 ', el('b', {}, sh.role === 'member' ? `Shared by ${sh.ownerName || 'its owner'}` : `You share it${sh.public ? ' · 🌍 public' : ''}`),
          ` · ${ready} step${ready === 1 ? '' : 's'} prepared for everybody${busyN ? ` · ⏳ ${busyN} being prepared by others` : ''} · your progress is your own`),
          tip(SHARE_RULES, sh.role === 'member' ? ' The Roadmap and its chapter plans are the owner’s. When they change it, 🔔 tells you and you take the changes you want into your copy.' : ' Your changes to the Roadmap are offered to everybody (each member takes what they want).'),
          sh.role === 'member' && sh.incoming ? el('button', { class: 'btn small primary cm-reviewbtn', onclick: () => reviewChanges(acc, cid, { onDone: () => drawMap() }) }, `🔔 ${sh.incoming.count} change${sh.incoming.count === 1 ? '' : 's'} from ${sh.ownerName || 'the owner'} · Review`) : null,
          sh.role === 'owner' ? el('button', { class: 'btn small', onclick: () => shareCurriculum(acc, cid, { onDone: () => drawMap() }) }, '👥 People') : null);
      };
      const showApp = (nid = null) => overlay((b2, close2) => b2.append(head('💬 Your Claude app', 'Your own Claude (with your Claude plan) plans and prepares the steps; the results appear on this Roadmap by themselves.'), appPanel(acc, cid, { onStudy, nid }), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))));
      /** 💬 the Claude app has worked on this map already (or the message was copied): the learner knows the way */
      const appKey = 'noema:appUsed:' + acc;
      const knowsApp = () => { try { if (localStorage.getItem(appKey)) return true; } catch (e) { }
        return Object.values(c.nodes || {}).some(n => /^claude-(app|chat)$/.test(n.pack?.via || '') || n.pack?.claimedAt) || (c.log || []).some(l => String(l.m || '').startsWith('💬 Claude app')); };
      const copyMsg = b => { try { localStorage.setItem(appKey, '1'); } catch (e) { } copy(J().message(C().get(acc, cid), { count: 1 }), b).then(() => { if (!b) toast(SL('copiedForClaude', '📋 Copied: paste it into a Claude chat'), 3500); }); if (page) { dotNow = null; drawMenu(); } };
      let dotNow = null;
      const drawBar = () => {
        const w = J().work(c); appBar.innerHTML = '';
        if (page) {   // the shell: no bar; a dot on ⋮ until the learner has used their Claude app once
          const dot = !w.done && c.provider === 'claudeapp' && !knowsApp();
          if (dot !== dotNow) { dotNow = dot; drawMenu(); }
          return;
        }
        if (w.done) return;
        appBar.append(el('span', {}, '💬 ', el('b', {}, 'For your Claude app: '), [w.toPlan.length ? `${w.toPlan.length} step${w.toPlan.length > 1 ? 's' : ''} to plan` : null, w.steps.length ? `${w.steps.length} to prepare` : null].filter(Boolean).join(' · ')),
          el('button', { class: 'btn small primary', onclick: e => copyMsg(e.currentTarget) }, '📋 Copy the message'), el('button', { class: 'btn small', onclick: () => showApp() }, 'How? · by hand'));
      };
      const study = (s, nid) => { close(); viaStep(acc, cid, nid, s); if (onStudy) onStudy(s); else window.Noema.switchTo(acc, s); };
      const addStep = () => editStep(acc, cid, null, { mode: 'add', onDone: nid => { drawMap(); if (nid) { sel = nid; drawMap(); showPanel(nid); scrollToNode(nid); } } });
      const exportJson = () => { const b = new Blob([JSON.stringify(C().get(acc, cid), null, 1)], { type: 'application/json' }); const a = el('a', { href: URL.createObjectURL(b), download: `curriculum-${cid}.json` }); document.body.append(a); a.click(); a.remove(); };
      const legend = () => el('div', { class: 'cm-legend tiny' }, el('span', {}, '✅ mastered · ', openIc(), ' open · 🔒 locked — master its prerequisites first · 📝 review it, then it is prepared · ⚡ prepared · ⏳ being prepared · 💬 waiting for your Claude app · 📦 taught by your own subject · 🔄 being re-planned'), tip('A step opens when every step before it (its prerequisites) is mastered: all its sections read and at least 80 % of its exercises solved — or the short “I already know this” test passed.'));
      const ART0 = () => window.NoemaArt;
      const sign = (cls, inner, text) => el('div', { class: 'cm-sign' }, el('span', { class: 'cm-st cm-' + cls }, el('span', { class: 'cm-dot', html: inner })), el('span', {}, text));
      const pipSign = (ic, text) => el('div', { class: 'cm-sign' }, el('span', { class: 'cm-badges' }, el('i', { class: 'cm-pip', html: ART0()?.svg(ic) || '' })), el('span', {}, text));
      const legendT = () => el('div', { class: 'cm-signs cm-tmap' },
        sign('mastered', ART0()?.svg('check') || '✓', SL('signMasteredLong', 'Mastered: its flag stays there')),
        sign('open', OPEN_SVG, SL('signOpenLong', 'Open: tap it to study; the number is how much of its practice you solved')),
        sign('open cm-nextup', OPEN_SVG, SL('signHereLong', 'You are here: your character waits at the next station')),
        sign('locked', ART0()?.svg('lock') || '🔒', SL('signLockedLong', 'Locked: master the stations that lead to it first')),
        pipSign('bolt', SL('signReady', 'Prepared: ready to study')), pipSign('edit', SL('signReview', 'Look over its plan, then it is prepared')),
        pipSign('clock', SL('signBusy', 'Being prepared')), pipSign('chat', SL('rmWaiting', 'Waiting for your Claude app')),
        pipSign('book', SL('signOwn', 'Taught by your own subject')), pipSign('sync', SL('signReplan', 'Being re-planned to match your subject')),
        pipSign('link', SL('signMaterial', 'Taught from your material')), pipSign('people', SL('signShared', 'Prepared by another member')),
        pipSign('info', SL('signFailed', 'Preparing failed: open it to try again')),
        el('p', { class: 'tiny' }, SL('signRule', 'A station opens when every station before it is mastered: all its sections read and at least 80% of its exercises solved, or the short “I already know this” test passed.')));
      const showLegend = () => SHL() ? SHL().sheet(SL('mapSigns', 'What the signs mean'), b2 => b2.append(page ? legendT() : legend())) : overlay((b2, close2) => b2.append(legend(), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))));
      const setList = on => { listMode = on; try { localStorage.setItem(viewKey, on ? 'list' : 'map'); } catch (e) { } drawMap(); drawMenu(); };
      /** the shell's ⋮ for this map: what is not needed all the time */
      const drawMenu = () => chrome?.(() => { const w = J().work(C().get(acc, cid) || c), waiting = w.toPlan.length + w.steps.length + (w.graph ? 1 : 0); return [
        c.provider === 'claudeapp' && !w.done ? { label: SL('copyForClaude', 'Copy the message for Claude'), sub: SL('copyForClaudeSub', `${waiting} waiting · paste it into a Claude chat`, { n: waiting }), icon: 'chat', badge: dotNow ? String(waiting) : null, run: () => copyMsg() } : null,
        { label: listMode ? SL('showAsMap', 'Show as a map') : SL('showAsList', 'Show as a list'), icon: listMode ? 'map' : 'list', run: () => setList(!listMode) },
        member ? null : { label: SL('addStep', 'Add a step'), icon: 'plus', run: addStep },
        member ? null : { label: c.shared && !c.shared.ended ? SL('sharing', 'Sharing') : SL('share', 'Share'), sub: SL('shareRmSub', 'Everybody keeps their own progress; the prepared steps are shared'), icon: 'people', run: () => shareCurriculum(acc, cid, { onDone: () => drawMap() }) },
        c.provider === 'claudeapp' ? { label: SL('claudeApp', 'Your Claude app'), sub: SL('claudeAppMapSub', 'Copy the message · by hand · import'), icon: 'chat', run: () => showApp() } : null,
        { label: SL('rmSettings', 'Settings'), sub: SL('rmSettingsSubAll', 'Prepare ahead, AI, budget, review, re-plan, delete'), icon: 'gear', run: () => settings() },
        { label: SL('exportJson', 'Export (.json)'), icon: 'download', run: exportJson }, '-',
        { label: SL('mapSigns', 'What the signs mean'), icon: 'help', run: showLegend }]; }, { menuDot: !!dotNow });
      const zoomTo = z => { const r = scroller.getBoundingClientRect(); const cx = (scroller.scrollLeft + r.width / 2) / zoom, cy = (scroller.scrollTop + r.height / 2) / zoom; zoom = Math.max(0.35, Math.min(1.6, z)); drawMap(); scroller.scrollLeft = cx * zoom - r.width / 2; scroller.scrollTop = cy * zoom - r.height / 2; };
      const fit = () => { const r = scroller.getBoundingClientRect(); zoomTo(vert ? Math.min(1, r.width / (+canvas.dataset.w || 1)) : Math.min(r.width / (+canvas.dataset.w || 1), r.height / (+canvas.dataset.h || 1))); };
      const tools = el('div', { class: 'cm-tools' },
        el('button', { class: 'btn small cm-zoom', title: 'Zoom out', 'aria-label': 'Zoom out', onclick: () => zoomTo(zoom / 1.2) }, '−'), el('button', { class: 'btn small cm-zoom', title: 'Zoom in', 'aria-label': 'Zoom in', onclick: () => zoomTo(zoom * 1.2) }, '+'),
        el('button', { class: 'btn small cm-zoom', title: SL('fitMap', 'See the whole map'), onclick: fit }, page ? '⤢' : '⤢ Fit'),
        el('button', { class: 'btn small primary cm-nextbtn', onclick: () => showNext() }, page ? SL('nextUp', 'Next up') : '▶ Next up'),
        page ? null : member ? null : el('button', { class: 'btn small', title: 'Add a step', onclick: addStep }, '➕ Step'),
        page ? null : member ? null : el('button', { class: 'btn small cm-sharetool', title: 'Share this Roadmap — everybody keeps their own progress, the prepared steps are shared', onclick: () => shareCurriculum(acc, cid, { onDone: () => drawMap() }) }, '👥'),
        page ? null : el('button', { class: 'btn small', title: 'Settings of this Roadmap', onclick: () => settings() }, '⚙️'));
      const seg = page ? el('div', { class: 'ns-seg small cm-viewseg', role: 'radiogroup', 'aria-label': SL('mapOrList', 'Map or list') }, ...[[false, SL('viewMap', 'Map')], [true, SL('viewList', 'List')]].map(([v, l]) => el('button', { class: 'cm-vbtn', 'data-list': String(v), role: 'radio', onclick: () => setList(v) }, l))) : null;
      box.append(el('div', { class: 'cm-top' }, page ? null : el('button', { class: 'btn small ghost', onclick: () => { close(); toLibrary(); } }, '← Roadmaps'), el('div', { class: 'cm-title' }, el('b', {}, (page ? '' : '🧭 ') + (c.title || c.goal)), sum), seg, tools, page ? null : el('button', { class: 'btn small', 'aria-label': 'Close', onclick: close }, '✕')),
        holdBar, appBar, shareBar, el('div', { class: 'cm-body' }, scroller, panel),
        page ? null : legend());

      function drawMap() {
        c = C().get(acc, cid) || c; const st = C().statuses(acc, c); const L = C().layout(c); const s = C().summary(acc, c);
        sum.textContent = page ? SL('rmSummary', '', { m: s.mastered, n: s.total }) + (G().paused() ? ' · ' + SL('signPaused', 'Preparing is paused') : '')
          : `${s.mastered}/${s.total} mastered · ${s.open} open · ${s.ready} prepared` + (G().paused() ? ' · ⏸ preparing paused' : ''); drawBar(); drawShareBar(); drawHold();
        box.classList.toggle('cm-listmode', !!listMode); seg?.querySelectorAll('button').forEach(b => { const on = (b.dataset.list === 'true') === !!listMode; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
        if (listMode) return drawList(st);
        if (vert) return drawTreasure(st);
        const nw = vert ? VW : NW, nh = vert ? VH : NH, gx = vert ? VGX : GX, gy = vert ? VGY : GY, top = vert ? VTOP : TOP;
        const rows = Math.max(...L.cols.map(col => col.length)), nL = L.cols.length;
        const W = vert ? rows * (nw + gx) + gx : nL * (nw + gx) + gx, H = vert ? top + nL * (nh + gy) + 40 : top + rows * (nh + gy) + 30;
        canvas.dataset.w = W; canvas.dataset.h = H; canvas.style.width = W * zoom + 'px'; canvas.style.height = H * zoom + 'px'; canvas.innerHTML = '';
        const inner = el('div', { class: 'cm-inner' + (vert ? ' cm-vert' : ''), style: { width: W + 'px', height: H + 'px', transform: `scale(${zoom})` } }); canvas.append(inner);
        const P = {};
        if (vert) L.cols.forEach((col, x) => { const off = (rows - col.length) * (nw + gx) / 2; col.forEach((id, y) => P[id] = { x: gx / 2 + off + y * (nw + gx), y: top + (nL - 1 - x) * (nh + gy) }); });   // layer 0 at the bottom
        else L.cols.forEach((col, x) => { const off = (rows - col.length) * (nh + gy) / 2; col.forEach((id, y) => P[id] = { x: gx / 2 + x * (nw + gx), y: top + off + y * (nh + gy) }); });
        // the three parts
        const goalT = c.title || c.goal;
        for (const [k, label] of [['prereq', '1 · Prerequisites'], ['core', '2 · ' + goalT], ['apps', '3 · Applications']]) { const [a, b] = L.parts[k]; if (b < a) continue;
          inner.append(el('div', { class: 'cm-band cm-' + k, style: vert ? { left: '6px', width: (W - 12) + 'px', top: (top + (nL - 1 - b) * (nh + gy) - gy / 2 + 6) + 'px', height: ((b - a + 1) * (nh + gy) - 12) + 'px' } : { left: (a * (nw + gx) + 8) + 'px', width: ((b - a + 1) * (nw + gx) - 16) + 'px', height: (H - 8) + 'px' } }, el('span', {}, label))); }
        if (vert) inner.append(el('div', { class: 'cm-chest', 'aria-hidden': 'true', style: { left: (W / 2 - 22) + 'px', top: '18px' }, html: '<svg viewBox="0 0 44 34" width="44" height="34"><rect x="3" y="12" width="38" height="20" rx="4" fill="var(--t2, #ffe8a3)" stroke="var(--t2i, #b07d10)" stroke-width="2"/><path d="M3 18h38M22 12v20" stroke="var(--t2i, #b07d10)" stroke-width="2"/><path d="M5 12q17-14 34 0" fill="var(--t2, #ffe8a3)" stroke="var(--t2i, #b07d10)" stroke-width="2"/></svg>' }));
        // edges
        const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'cm-edges');
        const rel = sel ? new Set([sel, ...c.edges.filter(e => e.to === sel).map(e => e.from), ...c.edges.filter(e => e.from === sel).map(e => e.to)]) : null;
        for (const e of c.edges) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; const p = document.createElementNS(NS, 'path');
          if (vert) { const x1 = a.x + nw / 2, y1 = a.y, x2 = b.x + nw / 2, y2 = b.y + nh, my = (y1 + y2) / 2; p.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`); }
          else { const x1 = a.x + nw, y1 = a.y + nh / 2, x2 = b.x, y2 = b.y + nh / 2, mx = (x1 + x2) / 2; p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); }
          p.setAttribute('class', (st[e.from].mastered ? 'ok' : '') + (rel && (e.from === sel || e.to === sel) ? ' hl' : '') + (rel && !(e.from === sel || e.to === sel) ? ' dim' : '')); svg.append(p); }
        inner.append(svg);
        // the learner's character waits at the next station
        const nx = vert ? C().nextUp(acc, c)[0] : null, ART = window.NoemaArt, TH = window.NoemaThemes;
        for (const [id, n] of Object.entries(c.nodes)) {
          const s2 = st[id], pk = n.pack?.status, key = c.id + '/' + id;
          const state = s2.mastered ? 'mastered' : s2.open ? 'open' : 'locked';
          const badge = s2.mastered ? '✅' : s2.locked ? '🔒' : openIc();
          const rx = c.shared && !c.shared.ended ? c.remote?.[id] : null;   // 👥 what the others did with this step
          const prep = pk === 'ready' ? '⚡' : rx?.status === 'ready' ? '⚡' : rx && !rx.mine ? '⏳' : pk === 'app' || J().needsPlan(n) && c.provider === 'claudeapp' && !member ? '💬' : pk === 'generating' || G().busy() === key ? '⏳' : pk === 'failed' ? '⚠️' : pk === 'paused' ? '⏸️' : s2.open && !s2.mastered && !n.reviewed && !c.autoApprove ? '📝' : '';
          const byOther = rx && !rx.mine ? (rx.status === 'ready' ? `prepared by ${rx.by || 'another member'}` : `being prepared by ${rx.by || 'another member'}`) : '';
          const prep2 = n.pack?.assigned ? (s2.replanning ? '🔄' : '📦') : prep;   // 📦 taught by the learner's own subject · 🔄 being re-planned to match it
          const b = el('button', { class: `cm-node cm-${state} cm-r-${n.role}` + (sel === id ? ' sel' : '') + (rel && !rel.has(id) ? ' dim' : '') + (id === nx ? ' cm-nextup' : ''), style: { left: P[id].x + 'px', top: P[id].y + 'px', width: nw + 'px', height: nh + 'px' }, 'data-id': id,
            'aria-label': `${n.title} — ${ROLE[n.role]} — ${state}${n.pack?.assigned ? (s2.replanning ? ', being re-planned to match your subject' : ', taught by your subject') : pk === 'ready' ? ', prepared' : ''}${byOther ? ', ' + byOther : ''}`, onclick: () => { sel = id; drawMap(); showPanel(id); } },
            id === nx && ART && TH ? el('span', { class: 'cm-ic cm-hero', title: 'Next up', html: ART.mascot(TH.current()) }) : el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, n.title), el('span', { class: 'cm-badges' }, badge, byOther ? el('span', { class: 'cm-by', title: byOther }, prep2, '👤') : prep2, n.material?.files?.length && !n.pack?.assigned ? el('span', { title: 'Your material: ' + n.material.files.map(f => f.name).join(', ') }, '📎') : null),
            s2.score && !s2.mastered ? el('i', { class: 'cm-prog', style: { width: fmtPct(s2.score) } }) : null);
          inner.append(b);
        }
        if (vert && !fitted && scroller.clientWidth) { fitted = true; const z = Math.max(0.45, Math.min(1, (scroller.clientWidth - 8) / W)); if (Math.abs(z - zoom) > 0.02) { zoom = z; drawMap(); } }
      }
      /** 🗺 The shell's Roadmap page: the treasure map of the design, drawn in the colours, fonts and little pictures of the
          learner's character. Dotted paths, round stations with a short code, a flag on every mastered one, the character
          beside the next one, the chest at the top. Selecting a station lights its paths up (and dims the others). */
      function drawTreasure(st) {
        const G2 = treasureLayout(c), { X, Y, W, H, E, layers, T, way, code } = G2, ART = window.NoemaArt, m = window.NoemaThemes?.current?.() || 'hedge';
        canvas.dataset.w = W; canvas.dataset.h = H; canvas.style.width = W * zoom + 'px'; canvas.style.height = H * zoom + 'px'; canvas.innerHTML = '';
        const inner = el('div', { class: 'cm-inner cm-vert cm-tmap', style: { width: W + 'px', height: H + 'px', transform: `scale(${zoom})` } }); canvas.append(inner);
        const rel = sel ? new Set([sel, ...c.edges.filter(e => e.to === sel).map(e => e.from), ...c.edges.filter(e => e.from === sel).map(e => e.to)]) : null;
        const f1 = v => +v.toFixed(1), mid = (a, b) => f1((a + b) / 2);
        const curve = ch => ch.map(id => [X[id], Y(id)]).reduce((d, [x, y], i, a) => i ? d + ` C${f1(a[i - 1][0])} ${mid(a[i - 1][1], y)} ${f1(x)} ${mid(a[i - 1][1], y)} ${f1(x)} ${y}` : `M${f1(x)} ${y}`, '');
        const edges = E.map(ch => { const a = ch[0], b = ch[ch.length - 1], s = st[a], on = rel && (a === sel || b === sel);
          return `<path class="cm-e ${s?.mastered ? 'ok' : s?.open ? 'op' : 'lk'}${on ? ' hl' : rel ? ' dim' : ''}" d="${curve(ch)}"/>`; }).join('');
        // the character's little world in the empty stretches of each layer
        let deco = '', k = 0;
        if (ART) layers.forEach((l, li) => { if (li === layers.length - 1) return; const xs = [[0, 0], ...l.map(id => [X[id], way[id] ? 12 : 62]), [W, 0]].sort((a, b) => a[0] - b[0]);
          for (let i = 1; i < xs.length; i++) { const a = xs[i - 1][0] + xs[i - 1][1] + 14, b = xs[i][0] - xs[i][1] - 14;
            if (b - a >= 26 && k++ % 2 === 0) deco += ART.glyph(m, mid(a, b), Y(l[0]) + 8, .95); } });
        // … and along the edges of the map, between the layers, where no path runs
        if (ART) layers.forEach((l, li) => { if (li >= layers.length - 2) return; const x = li % 2 ? W - 34 : 34, near = [...l, ...layers[li + 1]].some(id => Math.abs(X[id] - x) < 74);
          if (!near) deco += ART.glyph(m, x, mid(Y(l[0]), Y(layers[li + 1][0])) + 10, .85); });
        const flags = Object.keys(c.nodes).filter(id => st[id]?.mastered && X[id] != null).map(id => `<path class="cm-flag" d="M${f1(X[id] + 14)} ${Y(id) - 15} v-26 l15 6.5 l-15 6.5"/>`).join('');
        const tx = f1(X[T]), ty = Y(T);
        inner.insertAdjacentHTML('beforeend', `<svg class="cm-tsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="14" fill="none" stroke="var(--ink3)" stroke-opacity=".3" stroke-dasharray="2 6"/>${deco}
          <g transform="translate(40 48)" opacity=".6"><circle r="16" fill="none" stroke="var(--ink3)"/><path d="M0 -21 L4.5 0 L0 21 L-4.5 0Z" fill="var(--ink3)"/><path d="M0 -21 L4.5 0 L-4.5 0Z" fill="var(--t3i)"/><text y="-25" text-anchor="middle" font-size="11" fill="var(--ink3)">${esc(SL('compassN', 'N'))}</text></g>
          <text class="cm-start" x="22" y="${H - 20}">${esc(SL('rmStart', 'Start'))}</text>
          ${edges}
          <g transform="translate(${tx} ${ty})"><path d="M-11 -11 L11 11 M11 -11 L-11 11" stroke="var(--t3i)" stroke-width="5" stroke-linecap="round"/><g transform="translate(16 -34)"><rect x="0" y="6" width="40" height="26" rx="4" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/><path d="M0 14 q20 -18 40 0" fill="var(--t2)" stroke="var(--t2i)" stroke-width="1.5"/><rect x="16" y="14" width="8" height="9" rx="1.5" fill="var(--t2i)"/></g></g>
          ${flags}</svg>`);
        const goal = (c.title || c.goal || '').trim(), gw = Math.min(W - 130, 300);
        inner.append(el('div', { class: 'cm-tlabel', style: { left: f1(Math.max(20, Math.min(W - 20 - gw, tx - gw / 2))) + 'px', bottom: (H - ty + 40) + 'px', width: gw + 'px' } }, SL('rmTreasure', 'The treasure: ' + goal, { goal })));
        // the stations
        const nx = C().nextUp(acc, c)[0];
        for (const [id, n] of Object.entries(c.nodes)) {
          if (X[id] == null) continue;
          const s2 = st[id], state = s2.mastered ? 'mastered' : s2.open ? 'open' : 'locked', pct = Math.round((s2.score || 0) * 100), mk = s2.mastered ? [] : marks(id, n, s2);
          const inside = s2.mastered ? ART?.svg('check') || '✓' : s2.open ? (pct ? pct + '%' : OPEN_SVG) : ART?.svg('lock') || '🔒';
          let hero = null;
          if (id === nx && ART) { const l = layers[G2.L[id]], i = l.indexOf(id), lg = X[id] - (i ? X[l[i - 1]] : 0), rg = (i < l.length - 1 ? X[l[i + 1]] : W) - X[id];
            hero = el('span', { class: 'cm-hero ' + (rg > lg ? 'r' : 'l'), title: SL('signHere', 'You are here'), html: ART.mascot(m) }); }
          inner.append(el('button', { class: `cm-node cm-st cm-${state} cm-r-${n.role}` + (sel === id ? ' sel' : '') + (rel && !rel.has(id) ? ' dim' : '') + (id === nx ? ' cm-nextup' : ''), 'data-id': id,
            style: { left: f1(X[id] - 58) + 'px', top: (Y(id) - 22) + 'px' }, title: n.title,
            'aria-label': `${code[id]} · ${n.title} — ${SL(s2.mastered ? 'signMastered' : s2.open ? 'signOpen' : 'signLocked', state)}${s2.open && !s2.mastered && pct ? ` (${pct}%)` : ''}${mk.map(x => ', ' + x.t).join('')}`,
            onclick: () => { sel = id; drawMap(); showPanel(id); } },
            el('span', { class: 'cm-dot', html: inside }), el('b', { class: 'cm-code' }, code[id]), el('span', { class: 'cm-t' }, n.title),
            el('span', { class: 'cm-badges' }, ...mk.map(x => el('i', { class: 'cm-pip', 'data-k': x.k, title: x.t, html: ART ? ART.svg(x.ic) : '' }))), hero));
        }
        if (!fitted && scroller.clientWidth) { fitted = true; const z = Math.max(0.45, Math.min(1.25, (scroller.clientWidth - 24) / W)); if (Math.abs(z - zoom) > 0.02) { zoom = z; drawTreasure(st); } }
      }
      /** the small signs on a station (instead of the classic map's emoji badges): what is waiting on it */
      function marks(id, n, s2) {
        const pk = n.pack?.status, key = c.id + '/' + id, rx = c.shared && !c.shared.ended ? c.remote?.[id] : null, out = [], add = (k, ic, t) => out.push({ k, ic, t });
        if (n.pack?.assigned) s2.replanning ? add('replan', 'sync', SL('signReplan', 'Being re-planned to match your subject')) : add('own', 'book', SL('signOwn', 'Taught by your own subject'));
        else if (rx && !rx.mine) add('others', 'people', rx.status === 'ready' ? SL('signByOther', `Prepared by ${rx.by || 'another member'}`, { who: rx.by || '…' }) : SL('signByOtherBusy', `Being prepared by ${rx.by || 'another member'}`, { who: rx.by || '…' }));
        else if (pk === 'ready' || rx?.status === 'ready') { if (s2.open) add('ready', 'bolt', SL('signReady', 'Prepared: ready to study')); }
        else if (pk === 'app' || J().needsPlan(n) && c.provider === 'claudeapp' && !member) add('app', 'chat', SL('rmWaiting', 'Waiting for your Claude app'));
        else if (pk === 'generating' || G().busy() === key) add('busy', 'clock', SL('signBusy', 'Being prepared'));
        else if (pk === 'failed') add('failed', 'info', SL('signFailed', 'Preparing failed: open it to try again'));
        else if (pk === 'paused') add('paused', 'pause', SL('signPaused', 'Preparing is paused'));
        else if (s2.open && !n.reviewed && !c.autoApprove) add('review', 'edit', SL('signReview', 'Look over its plan, then it is prepared'));
        if (n.material?.files?.length && !n.pack?.assigned) add('material', 'link', SL('signMaterial', 'Taught from your material'));
        return out;
      }
      /** The same stations as a list, in study order (from the first prerequisite up to the goal). */
      function drawList(st) {
        const L = C().layout(c); canvas.innerHTML = ''; canvas.style.width = ''; canvas.style.height = '';
        const list = el('ol', { class: 'cm-list' });
        L.cols.forEach((col, x) => col.forEach(id => {
          const n = c.nodes[id], s2 = st[id], state = s2.mastered ? 'mastered' : s2.open ? 'open' : 'locked', pk = n.pack?.status;
          list.append(el('li', {}, el('button', { class: `cm-node cm-listnode cm-${state}` + (sel === id ? ' sel' : ''), 'data-id': id, onclick: () => { sel = id; drawMap(); showPanel(id); } },
            el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, el('b', {}, n.title), el('small', {}, (ROLE[n.role] || '') + (pk === 'ready' ? ' · ⚡ prepared' : pk === 'generating' ? ' · ⏳ preparing' : n.pack?.assigned ? ' · 📦 your subject' : ''))),
            el('span', { class: 'cm-badges' }, s2.mastered ? '✅' : s2.locked ? '🔒' : openIc()), s2.score && !s2.mastered ? el('i', { class: 'cm-prog', style: { width: fmtPct(s2.score) } }) : null)));
        }));
        canvas.append(list);
      }
      function showPanel(id) {
        c = C().get(acc, cid) || c; const n = c.nodes[id]; if (!n) return; const st = C().statuses(acc, c)[id]; const pk = n.pack || {}; const key = c.id + '/' + id;
        const T = x => c.nodes[x]?.title || x;
        const missing = st.parents.filter(p => !C().statuses(acc, c)[p].mastered);
        const live = G().live[key];
        panel.innerHTML = ''; panel.classList.add('on');
        const act = el('div', { class: 'cm-actions' });
        /** 📚 what the step is taught from: the learner's files and its prepared subject's sources, each one opens in the viewer */
        const srcBtn = () => (n.material?.files?.length || (pk.id && pk.status === 'ready')) ? el('button', { class: 'btn small cm-emo cm-srcbtn', title: SL('stepSources', 'Sources of this step'), 'aria-label': SL('stepSources', 'Sources of this step'), onclick: () => stepSources(acc, cid, id) }, '📚') : null;
        /** 📦 Use a subject I have · ↩ take it off — on any map, a shared one too (the change is the learner's own there). */
        const ownBtns = () => [
          pk.status !== 'generating' ? el('button', { class: 'btn small cm-usesubject', title: 'Study this step from a subject you already have — only this step is re-planned', onclick: () => attachDialog(acc, { cid, nid: id, onDone: () => { drawMap(); showPanel(id); } }) }, pk.assigned ? '📦 Use another subject' : '📦 Use a subject I have') : null,
            pk.assigned ? el('button', { class: 'btn small ghost cm-detach', onclick: () => {
              if (!confirm(`Take “${pk.title || pk.id}” off this step?\nThe subject stays (on your 📚 Shelf when no other step uses it). ${n.groupPlan ? 'The step gets the shared plan back, and the version prepared for everybody.' : 'The step is then planned again and prepared the usual way.'}`)) return;
              const r = C().Edit.detach(acc, cid, id); if (r.error) { toast('⚠️ ' + r.error, 5000); return; }
              if (C().get(acc, cid).nodes[id]?.replan && (c.provider === 'claudeapp' || LLM().pick(acc, c.provider))) replanNow(acc, cid, id);
              drawMap(); showPanel(id); } }, '↩ Take it off this step') : null];
        if (st.replanning) {   // 📦 a subject was attached: the step stays closed until its new plan is here — only this step is re-planned
          const busyR = replanBusy.has(cid + '/' + id), withAll = C().holding(c) && !n.chapters?.length;
          act.append(el('div', { class: 'cm-live cm-replanning' }, withAll ? `📦 Taught by “${pk.title || pk.id}”` : busyR ? '⏳ Re-planning it to match its subject…' : '🔄 Being re-planned to match its subject',
            el('span', { class: 'tiny' }, withAll ? ' — its chapters are planned from it together with the other steps (▶ Plan the steps now).' : ' — it opens when its new plan is here. The steps after it keep their plans.')),
            withAll || busyR ? null : c.provider === 'claudeapp' ? el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: e => copyMsg(e.currentTarget) }, '📋 Copy the message for Claude'), el('button', { class: 'btn small', onclick: () => showApp(id) }, 'How? · by hand'))
              : el('button', { class: 'btn primary cm-replannow', onclick: () => { replanNow(acc, cid, id); setTimeout(() => showPanel(id), 50); } }, '↻ Re-plan now'));
        }
        else if (st.open || st.mastered) {
          const appWay = () => el('details', { class: 'cg-faq cm-otherways' }, el('summary', {}, 'Other ways to prepare it'),
            el('div', { class: 'row' }, c.provider !== 'claudeapp' ? el('button', { class: 'btn small cm-toapp', onclick: () => { G().toApp(c, id); showPanel(id); showApp(id); } }, '💬 In my Claude app instead') : null, importBtn(acc, cid, id, () => { drawMap(); showPanel(id); })),
            el('p', { class: 'tiny' }, '💬 Your Claude app prepares it with your Claude plan (no API cost). 📥 Or import a .noema.zip that Claude made for this step.'));
          const rx = c.shared && !c.shared.ended ? c.remote?.[id] : null;   // 👥 shared: prepared / being prepared by somebody
          const getIt = async b => { b.disabled = true; b.textContent = '⬇️ Getting it…'; try { const pid = await SH().download(acc, cid, id); study(pid, id); } catch (e) { toast('⚠️ ' + e.message, 6000); b.disabled = false; b.textContent = '↻ Try again'; } };
          if (rx?.status === 'ready' && pk.status === 'ready' && pk.stale && !pk.own) act.append(el('button', { class: 'btn primary', onclick: () => study(pk.id, id) }, st.mastered ? '📖 Review' : '📖 Study this step'),
            el('p', { class: 'tiny cm-byline' }, `🔔 ${rx.by || 'Its author'} made a new version of this step — yours stays until you take it`),
            el('div', { class: 'row' }, el('button', { class: 'btn small cm-getstep', onclick: e => getIt(e.currentTarget) }, '⬇️ Get the new version'), el('button', { class: 'btn small ghost cm-keepstep', onclick: () => { SH().keepStep(acc, cid, id); drawMap(); showPanel(id); } }, 'Keep mine')));
          else if (rx?.status === 'ready' && (pk.status !== 'ready' || pk.stale) && !pk.own) act.append(el('p', { class: 'tiny cm-byline' }, `⚡ Prepared by ${rx.mine ? 'you' : rx.by || 'another member'} — shared with everybody in this Roadmap${pk.stale ? ' · its author made a new version' : ''}`),
            el('button', { class: 'btn primary cm-getstep', onclick: e => getIt(e.currentTarget) }, pk.stale ? '⬇️ Get the new version' : st.mastered ? '📖 Review' : '📖 Study this step'));
          else if (rx?.status === 'preparing' && !rx.mine && pk.status !== 'ready') act.append(el('div', { class: 'cm-live cm-othersprep' }, `⏳ ${rx.by || 'Another member'} is preparing this step`, el('span', { class: 'tiny' }, ' — it appears here for you when it is ready (nobody prepares it twice).')));
          else if (member && !n.chapters?.length && pk.status !== 'ready') act.append(el('div', { class: 'cm-live' }, '📝 Waiting for its chapter plan', el('span', { class: 'tiny' }, ` — ${c.shared.ownerName || 'the owner'} plans the steps of this Roadmap.`)));
          else if (pk.status === 'ready') act.append(el('button', { class: 'btn primary', onclick: () => study(pk.id, id) }, st.mastered ? '📖 Review' : '📖 Study this step'),
            pk.shared && rx && !rx.mine ? el('p', { class: 'tiny cm-byline' }, `⚡ Prepared by ${rx.by || 'another member'}`) : null,
            pk.own && rx && !rx.mine ? el('p', { class: 'tiny cm-byline' }, `This is your own version — ${rx.by || 'another member'}’s version ${rx.status === 'ready' ? 'is' : 'will be'} the shared one.`) : null);
          else if (pk.status === 'app') act.append(el('div', { class: 'cm-live cm-appq' }, '💬 Waiting for your Claude app', el('span', { class: 'tiny' }, ' — paste the message into a Claude chat; the step appears here by itself.')),
            el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: e => copyMsg(e.currentTarget) }, '📋 Copy the message for Claude'), el('button', { class: 'btn small', onclick: () => showApp(id) }, 'How? · by hand'), importBtn(acc, cid, id, () => { drawMap(); showPanel(id); }),
              el('button', { class: 'btn small ghost', title: 'Take it out of the Claude app’s queue', onclick: () => { G().fromApp(c, id); showPanel(id); } }, '↩ Not now')));
          else if (c.provider === 'claudeapp' && J().needsPlan(n)) act.append(el('div', { class: 'cm-live cm-appq' }, '💬 Its chapters are planned by your Claude app', el('span', { class: 'tiny' }, ' — paste the message into a Claude chat.')), el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: e => copyMsg(e.currentTarget) }, '📋 Copy the message for Claude'), el('button', { class: 'btn small', onclick: () => showApp(id) }, 'How? · by hand')));
          else if (pk.status === 'generating' || G().busy() === key) act.append(el('div', { class: 'cm-live' }, '⏳ Preparing… ', el('span', { class: 'tiny' }, live?.msg || '')), el('button', { class: 'btn small', onclick: () => { G().stop(); } }, '⏸ Pause'));
          else if (pk.status === 'paused' && pk.budgetHit) { const nb = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(Math.ceil((c.nodeBudget || 8) * 1.5)) }); act.append(el('p', { class: 'tiny' }, '💰 ' + (pk.error || 'The spending limit for this step was reached.')), el('label', { class: 'tiny' }, 'New limit $ ', nb), el('button', { class: 'btn primary', onclick: () => { G().request(c, id, { resume: true, raiseBudget: +nb.value || 0 }); showPanel(id); } }, '▶ Continue')); }
          else if (!n.reviewed && !c.autoApprove && pk.status !== 'failed') act.append(el('button', { class: 'btn primary', onclick: () => editStep(acc, cid, id, { mode: 'review', onDone: () => { drawMap(); showPanel(id); } }) }, '📝 Review & prepare this step'), tip('Before the material is generated you can check and change its chapters and goals. After that the chapters are fixed.'));
          else if (c.provider === 'claudeapp') act.append(el('button', { class: 'btn primary', onclick: () => { G().toApp(c, id); showPanel(id); showApp(id); } }, '💬 Prepare it in my Claude app'), importBtn(acc, cid, id, () => { drawMap(); showPanel(id); }));
          else act.append(el('button', { class: 'btn primary', onclick: () => { G().request(c, id, { resume: true }); toast?.('⏳ Preparing “' + n.title + '” — it usually takes 5–30 minutes; you can study something else meanwhile.', 5000); showPanel(id); } }, pk.status === 'failed' ? '↻ Try again' : '⚡ Prepare this step now'),
            pk.status === 'failed' ? el('p', { class: 'tiny cg-kstat bad' }, '⚠️ ' + pk.error) : null, appWay());
          if (!st.mastered) act.append(el('button', { class: 'btn small cm-knowit', onclick: () => test(id) }, '🎓 I already know this'));
          else if (st.how === 'test' || st.how === 'manual') act.append(el('button', { class: 'btn small ghost', onclick: () => { C().setMastered(acc, c, id, null); drawMap(); showPanel(id); } }, '↩ Undo “mastered”'));
        } else {
          act.append(el('p', { class: 'cm-lock' }, '🔒 Locked. Master these first: ', ...missing.map((p, i) => [i ? ', ' : '', el('a', { href: '#', onclick: e => { e.preventDefault(); sel = p; drawMap(); showPanel(p); scrollToNode(p); } }, T(p))])));
          const rx = c.shared && !c.shared.ended ? c.remote?.[id] : null;   // 👥 also for a locked step: who prepared / prepares it
          if (rx && !rx.mine) act.append(el('p', { class: 'tiny cm-byline' }, rx.status === 'ready' ? `⚡ Prepared by ${rx.by || 'another member'} — it is yours to study when it opens` : `⏳ ${rx.by || 'Another member'} is preparing this step`));
          // 📖 a prepared step can be read before it opens; its exercises wait (the subject opens read-only, engine/src/40_views.js stepLock)
          const readBtn = run => el('button', { class: 'btn small cm-readtheory', title: SL('readTheorySub', 'The exercises open when the step opens'), onclick: run }, '📖 ' + SL('readTheory', 'Read the theory'));
          if (pk.id && pk.status === 'ready') act.append(readBtn(() => study(pk.id, id)));
          else if (rx?.status === 'ready') act.append(readBtn(async e => { const b = e.currentTarget; b.disabled = true; try { study(await SH().download(acc, cid, id), id); } catch (er) { toast('⚠️ ' + er.message, 6000); b.disabled = false; } }));
        }
        const prog = st.mastered ? `✅ Mastered${st.how === 'test' ? ' (placement test)' : st.how === 'auto' ? '' : ''}` : pk.status === 'ready' ? `Progress: ${fmtPct(st.read)} read · ${fmtPct(st.score)} of the exercises solved (needs 100 % read + 80 % solved)` : '';
        const md = (n.chapters || []).map((ch, i) => `${i + 1}. **${String(ch.title).replace(/([*_`\\[\]])/g, '\\$1')}**`).join('\n');
        const chBox = el('div', { class: 'nx-chapters cm-chapters' });
        if (window.marked && window.DOMPurify && md) chBox.innerHTML = DOMPurify.sanitize(marked.parse(md)); else chBox.append(el('ol', {}, ...(n.chapters || []).map(ch => el('li', {}, ch.title))));
        // tap a chapter → its teaching goals and coverage
        [...chBox.querySelectorAll('li')].forEach((li, i) => { const ch = n.chapters[i]; if (!ch) return; li.tabIndex = 0; li.title = 'Show the goals of this chapter'; li.addEventListener('click', () => { const open = li.querySelector('.cm-chd'); if (open) { open.remove(); return; } li.append(el('div', { class: 'cm-chd tiny' }, el('div', {}, '🎯 ', (ch.goals || []).join(' · ')), el('div', {}, '📌 ', (ch.coverage || []).join(' · ')))); }); });
        const sm = splitSummary(n.summary), files = n.material?.files || [];
        // 📎 the learner's own material: one clip next to the title (hover: what it is; tap: the file, or which file)
        const clip = files.length ? el('span', { class: 'ns-menu cm-clipwrap' }, el('button', { class: 'cm-clip', 'data-pop': '1', title: 'Your material — this step is taught from it', 'aria-label': 'Your material — this step is taught from it: ' + files.map(f => f.name).join(', '),
          onclick: e => { e.stopPropagation(); const b = e.currentTarget; if (files.length === 1 || !SHL()?.popMenu) return openMaterial(acc, cid, id, files[0]); SHL().closePops?.(); SHL().popMenu(b, files.map(f => ({ label: f.name, sub: f.range ? `pages ${f.range[0]}–${f.range[1]}` : f.pages ? `${f.pages} pages` : '', icon: '📄', run: () => openMaterial(acc, cid, id, f) }))); } }, '📎')) : null;
        panel.append(el('button', { class: 'btn small ghost cm-pclose', 'aria-label': 'Close the panel', onclick: () => { panel.classList.remove('on'); sel = null; drawMap(); } }, '✕'),
          el('div', { class: 'cm-ptitle' }, el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('div', {}, el('h3', {}, n.title, clip ? ' ' : null, clip), el('div', { class: 'tiny cm-psub' }, [ROLE[n.role], sm.path, n.domains?.length ? n.domains.join(', ') : ''].filter(Boolean).join(' · ')))),
          prog ? el('p', { class: 'tiny' }, prog) : null, act,
          pk.assigned ? el('p', { class: 'tiny cm-byline cm-taughtby' }, `📦 Taught by your subject “${pk.title || pk.id}”`, (() => { const k = C().stepsOf(acc, pk.id).length - 1; return k > 0 ? ` — it also teaches ${k} other step${k === 1 ? '' : 's'} (same progress)` : ''; })()) : null,
          (() => { const from = C().planLocked(n) || member ? [] : st.parents.filter(p => c.nodes[p]?.pack?.assigned && c.nodes[p].assignedAt && (!n.plannedAt || c.nodes[p].assignedAt > n.plannedAt));
            return from.length ? el('p', { class: 'tiny cm-flag' }, `⚑ ${from.map(p => '“' + T(p) + '”').join(', ')} ${from.length === 1 ? 'is' : 'are'} now taught by your own subject — check that this step still fits (✏️ → ✨ Re-plan).`) : null; })(),
          member ? el('div', { class: 'row cm-ownrow' }, srcBtn(), ...ownBtns()) : el('div', { class: 'row cm-editrow' }, el('button', { class: 'btn small cm-emo cm-editbtn', title: SL('editStep', 'Edit this step'), 'aria-label': SL('editStep', 'Edit this step'), onclick: () => editStep(acc, cid, id, { onDone: nid => { drawMap(); if (nid === null) { panel.classList.remove('on'); sel = null; } else showPanel(id); } }) }, '✏️'), srcBtn(),
            c.shared?.role === 'owner' && c.remote?.[id] && !c.remote[id].mine ? el('button', { class: 'btn small ghost cm-removestep', title: 'Remove the version another member prepared (the step can then be prepared again)', onclick: async () => { if (!confirm(`Remove the version of “${n.title}” that ${c.remote[id].by || 'another member'} prepared? Everybody can then prepare it again.`)) return; try { await SH().removeStep(acc, cid, id); toast('🗑 Removed — the step can be prepared again'); } catch (e) { toast('⚠️ ' + e.message, 5000); } drawMap(); showPanel(id); } }, `🗑 ${c.remote[id].by || 'Member'}’s ${c.remote[id].status === 'ready' ? 'version' : 'reservation'}`) : null,
            !pk.status && !st.mastered && (n.reviewed || c.autoApprove) && !(st.open) && !c.remote?.[id] ? el('span', { class: 'tiny' }, '✔ reviewed — prepared when it opens') : null),
          n.learningGoals?.length ? el('div', {}, el('div', { class: 'nx-lbl' }, '🎯 After this step you can'), el('ul', { class: 'cm-goals' }, ...n.learningGoals.map(g => el('li', {}, g)))) : null,
          n.chapters?.length ? el('div', {}, el('div', { class: 'nx-lbl' }, `📖 ${n.chapters.length} chapters`, tip('Tap a chapter for its teaching goals and what it must cover.')), chBox) : null,
          st.parents.length ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Builds on: '), st.parents.map(T).join(' · ')) : null,
          (() => { const kids = c.edges.filter(e => e.from === id).map(e => T(e.to)); return kids.length ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Opens: '), kids.join(' · ')) : null; })(),
          n.kDomain ? el('div', { class: 'tiny cm-pre' }, el('b', {}, 'Kind of knowledge: '), n.kDomain.replace('_', ' '), n.levels?.length ? ' — ' + n.levels.map(l => l.replace(/_/g, ' ')).join(', ') : '') : null);
      }
      // scroll only the map (scrollIntoView would also scroll the full-screen frame and hide the top bar)
      function scrollToNode(id) {
        const b = canvas.querySelector(`[data-id="${CSS.escape(id)}"]`); if (!b) return;
        if (listMode) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        const x = parseFloat(b.style.left) * zoom, y = parseFloat(b.style.top) * zoom, r = scroller.getBoundingClientRect(), bw = b.offsetWidth || NW, bh = b.offsetHeight || NH;
        scroller.scrollTo({ left: Math.max(0, x - r.width / 2 + bw * zoom / 2), top: Math.max(0, y - r.height / 2 + bh * zoom / 2), behavior: 'smooth' });
      }
      function showNext() {
        const ids = C().nextUp(acc, c); const T = x => c.nodes[x].title;
        overlay((b2, close2) => b2.append(head('▶ Next up', 'Open steps, in a good study order'), ids.length ? el('ol', { class: 'cm-next' }, ...ids.slice(0, 30).map(id => el('li', {}, el('a', { href: '#', onclick: e => { e.preventDefault(); close2(); sel = id; drawMap(); showPanel(id); scrollToNode(id); } }, T(id)), ' ', el('span', { class: 'tiny' }, c.nodes[id].pack?.status === 'ready' ? '⚡ prepared' : c.nodes[id].pack?.status === 'generating' ? '⏳ preparing' : !c.nodes[id].reviewed && !c.autoApprove ? '📝 needs your review' : '✔ reviewed')))) : el('p', {}, '🎉 Everything is mastered!'), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))));
      }
      function settings() {
        overlay((b2, close2) => {
          const pf = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, n ? `${n} steps ahead` : 'only when I open a step'))); pf.value = String(c.prefetch ?? 3);
          const bud = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(c.nodeBudget || 8) });
          const prov = el('select', { class: 'noema-input' }, el('option', { value: 'claudeapp' }, '💬 Claude app (your Claude plan)'), el('option', { value: 'auto' }, 'Automatic (API key here)'), el('option', { value: 'claude' }, 'Claude — API key'), el('option', { value: 'gemini' }, 'Gemini')); prov.value = c.provider || 'auto';
          const pause = el('input', { type: 'checkbox' }); pause.checked = G().paused();
          const review = el('input', { type: 'checkbox' }); review.checked = !c.autoApprove;
          // ✨ re-plan every step not prepared yet, with the curriculum's own AI
          const E = C().Edit; const cur0 = C().get(acc, cid); const todo = Object.values(cur0.nodes).filter(n => !E.generated(n)).length, fixed = Object.keys(cur0.nodes).length - todo;
          const how = cur0.provider === 'claudeapp' ? 'your Claude app (your Claude plan)' : LLM().pick(acc, cur0.provider) === 'claude' ? 'Claude with your API key' : LLM().pick(acc, cur0.provider) === 'gemini' ? 'Gemini' : 'the AI (add a key first)';
          const wish = el('input', { class: 'noema-input', placeholder: 'Optional wish for every step, e.g. “more worked examples”, “exam focus”' });
          const rlog = el('div', { class: 'tiny cm-replanlog' });
          const rbtn = el('button', { class: 'btn small cm-replanall', disabled: !todo, onclick: async () => {
            if (!confirm(`Re-plan the chapters of ${todo} step${todo === 1 ? '' : 's'} with ${how}?${fixed ? `\n${fixed} step${fixed === 1 ? ' is' : 's are'} already prepared and keep${fixed === 1 ? 's' : ''} its chapters.` : ''}\nYou review each new plan before its step is prepared.`)) return;
            rbtn.disabled = true; rlog.textContent = '⏳ …';
            try {
              const r = await E.replanAll(acc, cid, { instruction: wish.value.trim(), onLog: m => { rlog.textContent = m; } });
              if (r.error) rlog.textContent = '⚠️ ' + r.error;
              else if (r.queued) { rlog.textContent = `💬 ${r.count} steps wait for your Claude app — copy the message from the 💬 bar of the Roadmap.`; window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); }
              else rlog.textContent = `✅ ${r.count} steps re-planned — review each one before it is prepared.`;
            } catch (e) { rlog.textContent = '⚠️ ' + e.message; }
            rbtn.disabled = false; drawMap();
          } }, `✨ Re-plan all ${todo} step${todo === 1 ? '' : 's'}`);
          const replanBox = el('details', { class: 'cg-faq' }, el('summary', {}, '✨ Re-plan the whole Roadmap'),
            el('p', { class: 'tiny' }, `Plans the chapters of every step that is not prepared yet again, the way this Roadmap is planned: with ${how}${cur0.provider === 'claudeapp' ? '' : ' (here, now)'}. Steps with your files are planned from the text of their pages. ${fixed ? `${fixed} prepared step${fixed === 1 ? ' keeps its' : 's keep their'} chapters. ` : ''}Every re-planned step waits for your review again.`),
            wish, el('div', { class: 'row' }, rbtn), rlog);
          // 💬 prepare many steps ahead in the Claude app (e.g. overnight, with a scheduled task in Claude Desktop)
          const left = Object.values(cur0.nodes).filter(n => !['ready', 'generating', 'app'].includes(n.pack?.status)).length, inQueue = Object.values(cur0.nodes).filter(n => n.pack?.status === 'app').length;
          const howMany = el('select', { class: 'noema-input cm-qmany', 'aria-label': 'How many steps' }, ...[5, 10, 20].filter(k => k < left).map(k => el('option', { value: k }, `the next ${k} steps`)), el('option', { value: 'all' }, `all ${left} steps not prepared yet`));
          const skipReview = el('input', { type: 'checkbox' }); skipReview.checked = !!cur0.autoApprove;
          const qlog = el('div', { class: 'tiny cm-qlog' });
          const qbtn = el('button', { class: 'btn small cm-queuemany', disabled: !left, onclick: () => {
            const r = G().queueMany(C().get(acc, cid), howMany.value, { review: !skipReview.checked }); drawMap();
            const msg = J().message(C().get(acc, cid), { count: 1 });
            qlog.innerHTML = ''; qlog.append(el('div', {}, `💬 ${r.queued} step${r.queued === 1 ? '' : 's'} queued for your Claude app (in study order).` + (r.needReview ? ` ${r.needReview} wait for your review (📝) — tick “without my review” to include them.` : '') + (r.needPlan ? ` ${r.needPlan} have no chapter plan yet${C().get(acc, cid).provider === 'claudeapp' ? ' — the Claude app plans them first' : ' — plan them first (✨ Re-plan)'}.` : '')),
              r.queued ? el('div', { class: 'row' }, el('button', { class: 'btn small primary', onclick: e => copy(msg, e.currentTarget) }, '📋 Copy the message (one step per run)')) : null);
          } }, '💬 Queue them');
          const aheadBox = el('details', { class: 'cg-faq cm-ahead' }, el('summary', {}, '💬 Prepare many steps ahead in the Claude app'),
            el('p', { class: 'tiny' }, `Queue steps for your Claude app — even locked ones — so the whole Roadmap gets prepared while you do other things.${inQueue ? ` ${inQueue} already wait in the queue.` : ''}`),
            el('div', { class: 'row' }, howMany, el('label', { class: 'tiny' }, skipReview, ' without my review (prepare them from their current plan)')), el('div', { class: 'row' }, qbtn), qlog,
            el('details', { class: 'tiny' }, el('summary', {}, 'Overnight, by itself: a scheduled task in Claude Desktop'),
              el('ol', {}, el('li', {}, 'Queue the steps here.'), el('li', {}, 'In Claude Desktop: Scheduled → New task. Paste the message (📋 above), choose “every hour” (or every 2 hours) for the night, and make sure the noema-lite connector and code execution are on for it.'),
                el('li', {}, 'Each run is a fresh chat that prepares ONE queued step and saves it; when the queue is empty, a run just says so. Your plan’s usage limits decide how many steps fit in a night — the runs after a limit simply continue later.'),
                el('li', {}, 'In the morning the prepared steps are ⚡ on this Roadmap (it picks them up when it opens).'))));
          b2.append(head('⚙️ ' + (c.title || c.goal), `${Object.keys(c.nodes).length} steps · built ${new Date(c.created).toLocaleDateString()}`),
            el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, 'Prepare ahead', pf), el('label', { class: 'cg-field' }, 'Claude: limit per step ($)', bud), el('label', { class: 'cg-field' }, 'AI for new steps', prov),
              member ? el('p', { class: 'tiny' }, `👥 Shared by ${c.shared.ownerName || 'its owner'}: you prepare steps nobody has prepared yet with your own AI (above); the Roadmap and its plans are the owner’s.`) : el('label', { class: 'tiny' }, review, ' Let me review each step before it is prepared (recommended)'),
              el('label', { class: 'tiny' }, pause, ' Pause preparing in the background on this device'), keysBox(acc), aheadBox, member ? null : replanBox),
            el('div', { class: 'row noema-ovfoot' },
              el('button', { class: 'btn primary cm-savesettings', onclick: () => { const cur = C().get(acc, cid); cur.prefetch = +pf.value; cur.nodeBudget = Math.max(1, +bud.value || 8); cur.provider = prov.value; cur.autoApprove = !review.checked;
                if (cur.provider !== 'claudeapp') for (const n of Object.values(cur.nodes)) if (n.pack?.status === 'app' && n.pack.auto) n.pack = { ...n.pack, status: null, queuedAt: null };   // queued ahead for the Claude app → prepared here now
                if (cur.provider === 'claudeapp' && cur.status === 'building') cur.status = 'waiting';
                C().save(acc, cur); G().setPaused(pause.checked); close2(); drawMap(); G().kick(); } }, 'Save'),
              el('button', { class: 'btn small', onclick: exportJson }, '⬇️ Export'),
              member ? el('button', { class: 'btn small ghost cm-leave', onclick: async () => { if (!confirm(`Leave “${c.title || c.goal}”? Your copy of the Roadmap goes; the steps you studied stay in your subjects, with your progress.`)) return; await SH().leave(acc, cid); close2(); close(); toLibrary(); } }, '↩ Leave')
                : el('button', { class: 'btn small ghost', onclick: async () => { const sh = C().get(acc, cid)?.shared; if (!confirm('Delete this Roadmap? The subjects already prepared stay in your subjects.' + (sh && !sh.ended && sh.role === 'owner' ? '\nIt is shared: sharing stops too (the others keep their copies).' : ''))) return; if (sh && !sh.ended && sh.role === 'owner') await SH().unpublish(acc, cid).catch(e => toast('⚠️ ' + e.message, 5000)); C().remove(acc, cid); close2(); close(); toLibrary(); } }, '🗑 Delete'),
              el('button', { class: 'btn small', onclick: close2 }, 'Close')));
        });
      }
      async function test(id) {
        const n = c.nodes[id];
        overlay((b2, close2) => {
          // first what the test is (nothing is prepared, no AI is asked, until the learner goes on)
          b2.append(head('🎓 ' + n.title, 'I already know this'),
            el('p', {}, 'A 10-question test, from the step’s own exercises when it is prepared. 8 of 10 right marks the step as mastered and opens the steps after it.'),
            el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary cm-teststart', onclick: () => { b2.replaceChildren(); run(b2, close2); } }, 'Proceed'), el('button', { class: 'btn small', onclick: close2 }, 'Go back')));
        });
        async function run(b2, close2) {
          b2.append(head('🎓 ' + n.title, 'Placement test — 8 of 10 right marks this step as mastered'), el('p', {}, '⏳ Preparing the questions…'));
          let qs; try { qs = await G().placementTest(c, id); } catch (e) { b2.lastChild.textContent = '⚠️ ' + e.message; b2.append(el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close2 }, 'Close'))); return; }
          let i = 0, right = 0; const body = el('div', { class: 'cm-test' }); b2.lastChild.replaceWith(body);
          const fmtQ = t => { const d = el('div', { class: 'cm-q' }); if (window.marked && window.DOMPurify) d.innerHTML = DOMPurify.sanitize(marked.parseInline(String(t))); else d.textContent = t; return d; };
          const ask = () => {
            body.innerHTML = '';
            if (i >= qs.length) { const ok = G().passTest(c, id, right / qs.length); body.append(el('div', { class: 'cg-status ' + (ok ? 'done' : 'error') }, ok ? `✅ ${right}/${qs.length} — mastered! The next steps are open.` : `${right}/${qs.length} — not yet (8/10 needed). Study the step and try again.`), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary', onclick: () => { close2(); drawMap(); showPanel(id); } }, 'OK'))); return; }
            const q = qs[i]; body.append(el('div', { class: 'tiny' }, `Question ${i + 1} of ${qs.length}`), fmtQ(q.q));
            const opts = el('div', { class: 'cm-opts' }, ...q.options.map((o, k) => el('button', { class: 'btn', onclick: () => {
              const ok = k === q.answer; if (ok) right++;
              [...opts.children].forEach((b, kk) => { b.disabled = true; if (kk === q.answer) b.classList.add('ok'); else if (kk === k) b.classList.add('bad'); });
              body.append(el('p', { class: 'tiny' }, (ok ? '✅ ' : '❌ ') + (q.explain || '')), el('button', { class: 'btn primary', onclick: () => { i++; ask(); } }, i + 1 < qs.length ? 'Next →' : 'See the result'));
            } }, o)));
            body.append(opts);
          };
          ask();
        }
      }
      drawMap(); drawMenu(); if (sel) { showPanel(sel); setTimeout(() => scrollToNode(sel), 60); } else { const first = C().nextUp(acc, c)[0]; if (first) setTimeout(() => scrollToNode(first), 60); }
      if (page && !sel && !listMode) requestAnimationFrame(() => { fitted = false; drawMap(); const first = C().nextUp(acc, c)[0]; if (first) scrollToNode(first); });
      if (appHelp) setTimeout(() => showApp(), 300);
      if (openSettings) setTimeout(() => settings(), 100);
      // live updates (statuses, preparation) — redraw at most twice a second
      let t = null; const redraw = () => { if (!box.isConnected) { offA(); offB(); offS?.(); return; } clearTimeout(t); t = setTimeout(() => { drawMap(); if (sel && panel.classList.contains('on')) showPanel(sel); }, 400); };
      const offA = C().onChange(redraw), offB = G().onChange(redraw); const offS = SH()?.onChange(redraw); const offC = J().App.onChange(() => { if (box.isConnected) drawBar(); else offC(); });
      scroller.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 0.9)); } }, { passive: false });
    });
  }

  /** In a node's subject: the curriculum it belongs to, mastery so far, back to the map. */
  function nodeInfo(acc, ref) { const c = C().get(acc, ref?.id); const n = c?.nodes[ref?.node]; if (!n) return null; const st = C().nodeStatus(acc, c, ref.node); return { c, n, st }; }
  return { importMap, library, create, map, mapOpts, progress, nodeInfo, editStep, attachDialog, attachMany, planNow, doAttach, likeness, reviewChanges, shareCurriculum, exploreCurricula, publicRoadmaps, openPublic, inviteRow };
})();
