/* =====================================================================================
   noema-lite — 👥 people (docs/SOCIAL.md): find classmates by name, study buddies, conversations with one person or a
   study group, sending files, subjects, Roadmaps and vault files in them. A study group also has its own folder of the
   vault (only its members see those files) and the Roadmaps shared in it (its members may join them).
   The server decides everything (cloud/supabase.sql §12): who may find you, who may message or invite you (your setting:
   buddies only by default), blocks, the 50 MB a person keeps (the vault and the files of conversations together), the
   formats a file may have, three reports hide a message. Messages are readable by the server, not end-to-end.
   Pages: #/people (Chats · Buddies · Groups, and finding people) · #/chat/<room> · #/group/<room> · #/join/<code>.
   The top bar's people button shows what waits: unread messages, invitations, buddy requests (polled while visible).
   ===================================================================================== */
window.NoemaSocial = (() => {
  'use strict';
  const N = () => window.Noema, CL = () => window.NoemaCloud, V = () => window.NoemaVault, CU = () => window.NoemaCurriculum, SH = () => window.NoemaCurShare;
  const T = (k, p) => window.NoemaI18n ? NoemaI18n.t('social.' + k, p) : k;
  const acc = () => N()?.account?.id || null;
  const me = () => CL()?.session?.()?.user?.id || null;
  const on = () => !!(me() && N()?.account?.kind === 'cloud');
  const toast = (m, ms) => N()?.toast?.(m, ms);
  const enc = encodeURIComponent;
  /** replaceChildren without the parts that are not there (the DOM would write “null”) */
  const put = (el, ...kids) => el.replaceChildren(...kids.filter(k => k != null && k !== false));
  const BUCKET = 'noema-chat', MAX_BODY = 4000;
  /** The server's refusals in the learner's words (cloud/supabase.sql §12 raises them in English) */
  const WHY = [[/do not take messages/, 'err.noMessages'], [/do not take invitations/, 'err.noInvites'], [/blocked|not possible/, 'err.blocked'], [/quota/, 'err.quota'],
    [/too many messages/, 'err.slow'], [/too many open requests/, 'err.manyAsks'], [/too many new groups/, 'err.manyGroups'], [/group is full/, 'err.full'],
    [/invitation link/, 'err.badLink'], [/person not found/, 'err.noPerson'], [/not a member/, 'err.notMember'], [/attachment not found/, 'err.attachment']];
  const why = e => { const m = String(e?.message || e); const w = WHY.find(([re]) => re.test(m)); return w ? T(w[1], { mb: 50 }) : (window.NoemaI18n ? NoemaI18n.err(e) : m); };
  const fail = e => toast('⚠️ ' + why(e), 6000);

  /* ---------- the server (row-level security and the functions of cloud/supabase.sql §12) ---------- */
  const api = (path, o) => CL().api(path, o);
  const rpc = (fn, body = {}) => api('/rest/v1/rpc/' + fn, { method: 'POST', body });
  const minimal = { Prefer: 'return=minimal' };
  /** the name as it is searched: folded, in plain and in scholarly Latin letters (one string, each word once) */
  const searchOf = name => [...new Set((V()?.forms ? V().forms(name) : [String(name).toLowerCase()]).join(' ').split(/\s+/).filter(Boolean))].join(' ').slice(0, 600);
  const clean = q => String(q || '').replace(/[,()"*\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  const Server = {
    async people(ids) { ids = [...new Set(ids)].filter(Boolean); if (!ids.length) return []; return (await api(`/rest/v1/noema_people?select=user_id,display_name,emoji,university&user_id=in.(${ids.map(enc).join(',')})`)) || []; },
    async search(q) {
      const words = clean(q); if (words.length < 2) return [];
      const forms = [...new Set((V()?.forms ? V().forms(words) : [words.toLowerCase()]))];
      const rows = (await api(`/rest/v1/noema_people?select=user_id,display_name,emoji,university&or=(${forms.map(f => `search.ilike."*${enc(f)}*"`).join(',')})&user_id=neq.${me()}&limit=30`)) || [];   // i18n-ignore (a REST query)
      return rows.filter(p => !S.blocks.includes(p.user_id));
    },
    buddies: () => api('/rest/v1/noema_buddies?select=*'),
    ask: x => rpc('noema_buddy_ask', { x }),
    answer: (x, yes) => rpc('noema_buddy_answer', { x, yes }),
    unbuddy: x => { const [a, b] = [me(), x].sort(); return api(`/rest/v1/noema_buddies?a=eq.${a}&b=eq.${b}`, { method: 'DELETE' }); },
    blocks: () => api('/rest/v1/noema_blocks?select=blocked,created_at'),
    block: x => api('/rest/v1/noema_blocks', { method: 'POST', body: [{ blocker: me(), blocked: x }], headers: minimal }),
    unblock: x => api(`/rest/v1/noema_blocks?blocked=eq.${x}`, { method: 'DELETE' }),
    inbox: () => rpc('noema_inbox'),
    dm: x => rpc('noema_dm_open', { x }),
    group: g => rpc('noema_group_create', g),
    async room(id) { return ((await api(`/rest/v1/noema_rooms?select=*&id=eq.${enc(id)}`)) || [])[0] || null; },
    members: id => api(`/rest/v1/noema_room_members?select=user_id,role,status,last_read,muted,joined_at&room=eq.${enc(id)}&status=neq.left`),
    latest: (id, n = 80) => api(`/rest/v1/noema_messages?select=*&room=eq.${enc(id)}&order=created_at.desc&limit=${n}`),
    before: (id, t, n = 80) => api(`/rest/v1/noema_messages?select=*&room=eq.${enc(id)}&created_at=lt.${enc(t)}&order=created_at.desc&limit=${n}`),
    async send(room, body, att = null) { return ((await api('/rest/v1/noema_messages', { method: 'POST', body: [{ room, author: me(), body: body || '', att }], headers: { Prefer: 'return=representation' } })) || [])[0]; },
    edit: (id, body) => api(`/rest/v1/noema_messages?id=eq.${enc(id)}`, { method: 'PATCH', body: { body }, headers: minimal }),
    remove: id => api(`/rest/v1/noema_messages?id=eq.${enc(id)}`, { method: 'PATCH', body: { deleted: true }, headers: minimal }),
    report: (message, reason, note) => api('/rest/v1/noema_message_reports', { method: 'POST', body: [{ message, reporter: me(), reason, note: note || null }], headers: minimal }),
    read: (room, at) => api(`/rest/v1/noema_room_members?room=eq.${enc(room)}&user_id=eq.${me()}`, { method: 'PATCH', body: { last_read: at }, headers: minimal }),
    member: (room, user, patch) => api(`/rest/v1/noema_room_members?room=eq.${enc(room)}&user_id=eq.${enc(user)}`, { method: 'PATCH', body: patch, headers: minimal }),
    setRoom: (room, patch) => api(`/rest/v1/noema_rooms?id=eq.${enc(room)}`, { method: 'PATCH', body: patch, headers: minimal }),
    invite: (r, x) => rpc('noema_room_invite', { r, x }),
    async peek(code) { return ((await rpc('noema_room_peek', { code })) || [])[0] || null; },
    join: code => rpc('noema_room_join', { code }),
    roadmaps: room => api(`/rest/v1/noema_room_roadmaps?select=*&room=eq.${enc(room)}`),
    shareRoadmap: (room, curriculum) => api('/rest/v1/noema_room_roadmaps?on_conflict=room,curriculum', { method: 'POST', body: [{ room, curriculum, added_by: me() }], headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' } }),
    unshareRoadmap: (room, curriculum) => api(`/rest/v1/noema_room_roadmaps?room=eq.${enc(room)}&curriculum=eq.${enc(curriculum)}`, { method: 'DELETE' }),
    async curricula(ids) { if (!ids.length) return []; return (await api(`/rest/v1/noema_curricula_shared?select=id,title,description,owner,owner_name,public,meta&id=in.(${ids.map(enc).join(',')})`)) || []; },
    /** what this person keeps on the server: the vault and the files of conversations (≤ 50 MB together) */
    async used() {
      const [a, b] = await Promise.all([api(`/rest/v1/noema_chat_files?select=size&owner=eq.${me()}`).catch(() => []), api('/rest/v1/noema_vault_files?select=size').catch(() => [])]);
      return [...(a || []), ...(b || [])].reduce((s, r) => s + (r.size || 0), 0);
    },
    /** a file in a room: its row (the server counts it), the file, then the server checks its size */
    async putFile(room, file, mime) {
      const ext = (String(file.name).toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || 'json', path = `rooms/${room}/${crypto.randomUUID()}.${ext}`;
      await api('/rest/v1/noema_chat_files', { method: 'POST', body: [{ path, room, owner: me(), name: String(file.name).slice(0, 200), mime, size: file.size }], headers: minimal });
      try { await CL().putFile(BUCKET, path, file, mime); await rpc('noema_chat_finish', { p: path }); }
      catch (e) { await Server.dropFile(path).catch(() => { }); throw e; }
      return path;
    },
    async dropFile(path) { await CL().deleteObjects(BUCKET, [path]).catch(() => { }); await api(`/rest/v1/noema_chat_files?path=eq.${enc(path)}`, { method: 'DELETE' }); },
    blob: (path, type) => CL().getFile(BUCKET, path, 0, { type }),
    async page(id) { try { return await CL().publicPage(id); } catch (e) { return null; } },
  };

  /* ---------- what is known now: my row, my conversations, my buddies, my blocks, names (one cache, one listener list) ---------- */
  const S = { mine: null, inbox: [], buddies: [], blocks: [], names: {}, listeners: new Set(), started: false, loaded: false };
  const emit = () => S.listeners.forEach(f => { try { f(); } catch (e) { } });
  function onChange(f) { S.listeners.add(f); f(); return () => S.listeners.delete(f); }
  /** my row: made the first time (findable, buddies may message me), kept in step with the account's name and emoji */
  async function ensureMe(force = false) {
    if (S.mine && !force) return S.mine;
    const a = N()?.account || {}, name = String(a.name || CL().session().user.email.split('@')[0]).trim().slice(0, 80) || '…';
    const row = ((await api(`/rest/v1/noema_people?select=*&user_id=eq.${me()}`)) || [])[0] || null, search = searchOf(name);
    if (!row || row.display_name !== name || (row.emoji || null) !== (a.emoji || null) || row.search !== search) {
      const up = { user_id: me(), display_name: name, emoji: a.emoji || null, search };
      await api('/rest/v1/noema_people?on_conflict=user_id', { method: 'POST', body: [up], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
      S.mine = { findable: true, dm_from: 'buddies', ...(row || {}), ...up };
    } else S.mine = row;
    return S.mine;
  }
  /** the first-time note ("others can now find you") until it is dismissed or Privacy is saved, once per person on this device */
  const NOTED = () => 'noema-social-noted:' + me();
  const noted = () => { try { return localStorage.getItem(NOTED()) === '1'; } catch (e) { return true; } };
  const markNoted = () => { try { localStorage.setItem(NOTED(), '1'); } catch (e) { } };
  async function savePrivacy(patch) { await api(`/rest/v1/noema_people?user_id=eq.${me()}`, { method: 'PATCH', body: patch, headers: minimal }); S.mine = { ...S.mine, ...patch }; emit(); }
  async function refresh() {
    if (!on()) return;
    const [ib, bd, bl] = await Promise.all([Server.inbox(), Server.buddies(), Server.blocks()]);
    S.inbox = ib || []; S.buddies = bd || []; S.blocks = (bl || []).map(x => x.blocked); S.loaded = true;
    const unknown = S.buddies.map(b => b.a === me() ? b.b : b.a).filter(x => !S.names[x]);
    if (unknown.length) await names(unknown).catch(() => { });
    emit();
  }
  async function names(ids) { for (const p of await Server.people(ids.filter(x => !S.names[x]))) S.names[p.user_id] = p; return ids.map(x => S.names[x]).filter(Boolean); }
  const nameOf = x => S.names[x]?.display_name || S.inbox.find(r => r.other === x)?.other_name || T('someone');
  const emojiOf = x => S.names[x]?.emoji || S.inbox.find(r => r.other === x)?.other_emoji || '';
  /** 🤝 with this person: 'buddies' · 'asked' (I asked) · 'theyAsked' · 'blocked' (I blocked them) · 'none' */
  function bond(x) {
    if (S.blocks.includes(x)) return 'blocked';
    const b = S.buddies.find(r => (r.a === x || r.b === x)); if (!b) return 'none';
    return b.status === 'buddies' ? 'buddies' : b.asked_by === me() ? 'asked' : 'theyAsked';
  }
  const requests = () => S.buddies.filter(b => b.status === 'pending' && b.asked_by !== me());
  /** what waits for me: unread messages (muted rooms aside), invitations to groups, buddy requests */
  const waiting = () => S.inbox.reduce((n, r) => n + (r.status === 'invited' ? 1 : r.muted ? 0 : (r.unread || 0)), 0) + requests().length;
  function start() {
    if (S.started || !on()) return; S.started = true;
    ensureMe().catch(e => console.warn('[social]', e.message));   // i18n-ignore (console)
    const tick = () => { if (document.visibilityState === 'visible' && on()) refresh().catch(() => { }); };
    tick(); setInterval(tick, 45000); document.addEventListener('visibilitychange', tick);
  }

  /* ---------- small view helpers ---------- */
  const fmt = (t, o) => { try { return window.NoemaI18n ? NoemaI18n.fmt.date(t, o) : new Date(t).toLocaleString(undefined, o); } catch (e) { return ''; } };
  /** a moment, as short as it can be: 14:05 today, 3 Oct this year, 3 Oct 2024 before */
  const when = t => { const d = new Date(t), n = new Date(); if (d.toDateString() === n.toDateString()) return fmt(t, { hour: 'numeric', minute: '2-digit' }); return fmt(t, d.getFullYear() === n.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }); };
  const num = n => window.NoemaI18n ? NoemaI18n.fmt.number(n) : String(n);
  const mb = n => (window.NoemaI18n ? NoemaI18n.fmt.number(Math.max(0.1, n / 1048576), { maximumFractionDigits: 1 }) : (n / 1048576).toFixed(1)) + ' MB';   // i18n-ignore (unit)
  const face = (h, emoji, name, n = 1) => h('span', { class: 'ns-ico so-face', style: { '--bgc': `var(--t${n})`, '--fgc': `var(--t${n}i)` }, 'aria-hidden': 'true' }, emoji || String(name || '?').trim().slice(0, 1).toUpperCase() || '?');
  const tone = id => 1 + (String(id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 4);
  const busy = async (b, fn) => { if (b) b.disabled = true; try { return await fn(); } catch (e) { fail(e); } finally { if (b && b.isConnected) b.disabled = false; } };
  const signedOut = (ctx, v) => v.append(ctx.h('div', { class: 'ns-panel ns-empty' }, ctx.h('p', {}, T('signIn')), ctx.h('button', { class: 'btn primary', onclick: () => N()?.openAccountPicker?.() }, T('signInBtn'))));
  const attLabel = k => ({ file: T('att.file'), subject: T('att.subject'), roadmap: T('att.roadmap'), vault: T('att.vault') })[k] || '';
  const roomName = r => r.kind === 'dm' ? (r.other_name || T('someone')) : r.name;
  /** A dialog of the frame (NoemaShell.modal) with its title and ✕ */
  const dialog = (ctx, title, build, o) => ctx.modal(title, ({ head, body, close }) => {
    head.append(ctx.h('b', {}, title), ctx.h('button', { class: 'ns-iconbtn', 'aria-label': ctx.L('close'), onclick: close }, ctx.svg('close'))); build(body, close); }, o);
  const link = path => location.href.split('#')[0].split('?')[0] + '#/' + path;
  const copy = (text, done) => (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast(done, 2500), () => prompt('', text));

  /* ======================= #/people: Chats · Buddies · Groups, and finding people ======================= */
  const TAB = 'noema-social-tab';
  function home(ctx) {
    const { h, page: pg, svg } = ctx;
    const v = pg({ tab: null, crumbs: [[T('title')]], cls: 'so-view', menu: () => [
      { label: T('privacy'), sub: T('privacySub'), icon: 'lock', run: () => privacy(ctx) },
      { label: T('blocked'), sub: T('blockedSub'), icon: 'flag', run: () => blockedList(ctx) },
      { label: T('howItWorks'), icon: 'info', run: () => about(ctx) }] });
    v.append(h('h1', {}, T('title')), h('p', { class: 'ns-muted so-lead' }, T('lead')));
    if (!on()) return signedOut(ctx, v);
    let tab = (() => { try { return sessionStorage.getItem(TAB) || 'chats'; } catch (e) { return 'chats'; } })();
    const q = h('input', { class: 'noema-input ns-srin so-find', type: 'search', placeholder: T('findPh'), 'aria-label': T('find'), autocomplete: 'off' });
    const found = h('div', { class: 'so-found', hidden: true });
    const note = h('div', { class: 'so-note' });
    const seg = h('div', { class: 'ns-seg so-tabs', role: 'tablist', 'aria-label': T('title') });
    const out = h('div', { class: 'so-out' }, h('p', { class: 'ns-muted' }, T('loading')));
    v.append(q, found, note, seg, out);
    let t = 0, last = '';
    q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => {
      const s = clean(q.value); if (s === last) return; last = s;
      if (s.length < 2) { found.hidden = true; found.replaceChildren(); return; }
      let rows = []; try { rows = await Server.search(s); } catch (e) { found.hidden = false; found.replaceChildren(h('p', { class: 'tiny ns-muted' }, why(e))); return; }
      if (clean(q.value) !== s) return;
      rows.forEach(p => { S.names[p.user_id] = p; });
      found.hidden = false;
      found.replaceChildren(h('span', { class: 'ns-label' }, T('foundN', { n: rows.length })), rows.length ? h('div', { class: 'ns-list' }, ...rows.map(p => personRow(ctx, p.user_id, { onChange: draw }))) : h('p', { class: 'tiny ns-muted' }, T('foundNone')));
    }, 250); });
    function draw() {
      if (!v.isConnected) return off();
      const nReq = requests().length, nChat = S.inbox.filter(r => r.status === 'joined').reduce((a, r) => a + (r.muted ? 0 : r.unread || 0), 0) + S.inbox.filter(r => r.status === 'invited').length;
      seg.replaceChildren(...[['chats', T('chats'), nChat], ['buddies', T('buddies'), nReq], ['groups', T('groups'), 0]].map(([k, l, n]) => h('button', { class: tab === k ? 'on' : '', role: 'tab', 'aria-selected': String(tab === k), 'data-tab': k,
        onclick: () => { tab = k; try { sessionStorage.setItem(TAB, k); } catch (e) { } draw(); } }, l, n ? h('span', { class: 'so-count', 'aria-label': T('newN', { n }) }, num(n)) : null)));
      if (S.mine && !noted()) note.replaceChildren(h('div', { class: 'ns-panel tiny so-first' }, h('p', {}, T('firstNote', { name: S.mine.display_name })),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => privacy(ctx) }, svg('lock'), ' ', T('privacy')), h('button', { class: 'btn small ghost', onclick: () => { markNoted(); note.replaceChildren(); } }, T('gotIt')))));
      if (!S.loaded) return;
      out.replaceChildren(tab === 'buddies' ? buddiesTab(ctx, draw) : tab === 'groups' ? groupsTab(ctx) : chatsTab(ctx));
    }
    const off = onChange(draw);
    ensureMe().then(draw).catch(() => { });
    refresh().catch(e => out.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('offline')), h('p', { class: 'tiny ns-muted' }, why(e)))));
  }
  function roomRow(ctx, r) {
    const { h, chev } = ctx, mine = r.last_author === me();
    const prev = r.last_kind && !r.last_body ? '📎 ' + attLabel(r.last_kind) : (r.last_body || (r.kind === 'group' ? T('groupNoMsgs') : ''));   // i18n-ignore (📎: a sign)
    return h('button', { class: 'ns-item so-room' + (r.unread && !r.muted ? ' unread' : ''), 'data-room': r.room, onclick: () => ctx.go('#/chat/' + r.room) },
      face(h, r.kind === 'dm' ? r.other_emoji : r.emoji, roomName(r), tone(r.room)),
      h('span', { class: 't' }, h('b', {}, roomName(r)), h('small', { class: 'so-prev' }, (mine && r.last_body ? T('you') + ' ' : '') + prev)),
      h('span', { class: 'so-when tiny' }, h('span', {}, when(r.last_at)), r.unread && !r.muted ? h('span', { class: 'so-count', 'aria-label': T('newN', { n: r.unread }) }, num(r.unread)) : r.muted ? h('span', { class: 'ns-muted', title: T('muted') }, '🔕') : null), chev());   // i18n-ignore (🔕: a sign)
  }
  function inviteRow(ctx, r) {
    const { h } = ctx;
    return h('div', { class: 'ns-panel so-invite', 'data-room': r.room }, face(h, r.emoji, r.name, tone(r.room)),
      h('div', { class: 'grow' }, h('b', {}, r.name), h('small', { class: 'tiny ns-muted' }, T('invitedTo', { n: r.members }))),
      h('div', { class: 'row' }, h('button', { class: 'btn small primary so-joinbtn', onclick: e => busy(e.currentTarget, async () => { await Server.member(r.room, me(), { status: 'joined' }); await refresh(); ctx.go('#/chat/' + r.room); }) }, T('join')),
        h('button', { class: 'btn small ghost', onclick: e => busy(e.currentTarget, async () => { await Server.member(r.room, me(), { status: 'left' }); await refresh(); }) }, T('decline'))));
  }
  function chatsTab(ctx) {
    const { h } = ctx, inv = S.inbox.filter(r => r.status === 'invited'), rooms = S.inbox.filter(r => r.status === 'joined');
    return h('div', { class: 'so-chats' }, ...inv.map(r => inviteRow(ctx, r)),
      rooms.length ? h('div', { class: 'ns-list' }, ...rooms.map(r => roomRow(ctx, r))) : h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, T('noChats'))));
  }
  function buddiesTab(ctx, redraw) {
    const { h } = ctx, other = b => b.a === me() ? b.b : b.a;
    const got = requests(), sent = S.buddies.filter(b => b.status === 'pending' && b.asked_by === me()), mine = S.buddies.filter(b => b.status === 'buddies');
    const sec = (label, list) => list.length ? [h('span', { class: 'ns-label' }, label), h('div', { class: 'ns-list' }, ...list.map(b => personRow(ctx, other(b), { onChange: redraw })))] : [];
    return h('div', { class: 'so-buddies' }, ...sec(T('requestsGot'), got), ...sec(T('myBuddies'), mine), ...sec(T('requestsSent'), sent),
      got.length + sent.length + mine.length ? null : h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, T('noBuddies'))));
  }
  function groupsTab(ctx) {
    const { h, svg } = ctx, groups = S.inbox.filter(r => r.kind === 'group' && r.status === 'joined');
    const code = h('input', { class: 'noema-input small so-code', placeholder: T('linkPh'), 'aria-label': T('joinLink') });
    return h('div', { class: 'so-groups' },
      h('div', { class: 'row' }, h('button', { class: 'btn primary so-newgroup', onclick: () => newGroup(ctx) }, svg('plus'), ' ', T('newGroup'))),
      groups.length ? h('div', { class: 'ns-list' }, ...groups.map(r => roomRow(ctx, r))) : h('p', { class: 'ns-muted tiny' }, T('noGroups')),
      h('details', { class: 'so-joinby' }, h('summary', {}, T('joinLink')), h('div', { class: 'row' }, code, h('button', { class: 'btn small', onclick: () => { const m = String(code.value).match(/([A-Za-z0-9]{12,40})\s*$/); if (m) ctx.go('#/join/' + m[1]); else toast(T('err.badLink'), 4000); } }, T('open')))));
  }

  /* ---------- one person: a row (with the one thing to do next) and their sheet ---------- */
  function personRow(ctx, x, { onChange: changed } = {}) {
    const { h, chev } = ctx, st = bond(x), p = S.names[x] || {};
    const act = {
      none: [T('ask'), async () => { const r = await Server.ask(x); toast(r === 'buddies' ? T('nowBuddies', { name: nameOf(x) }) : T('asked', { name: nameOf(x) }), 3500); }],
      theyAsked: [T('accept'), async () => { await Server.answer(x, true); toast(T('nowBuddies', { name: nameOf(x) }), 3500); }],
      buddies: [T('message'), async () => { const r = await Server.dm(x); ctx.go('#/chat/' + r); }],
    }[st];
    return h('div', { class: 'ns-item so-person', 'data-person': x, 'data-bond': st },
      h('button', { class: 'so-who', onclick: () => person(ctx, x, changed) }, face(h, p.emoji || emojiOf(x), nameOf(x), tone(x)), h('span', { class: 't' }, h('b', {}, nameOf(x)), h('small', {}, [p.university, st !== 'none' && T('bond.' + st)].filter(Boolean).join(' · ')))),
      act ? h('button', { class: 'btn small ' + (st === 'buddies' ? 'ghost' : 'primary') + ' so-act', onclick: e => busy(e.currentTarget, async () => { await act[1](); await refresh(); changed?.(); }) }, act[0]) : null,
      st === 'theyAsked' ? h('button', { class: 'btn small ghost so-decline', onclick: e => busy(e.currentTarget, async () => { await Server.answer(x, false); await refresh(); changed?.(); }) }, T('decline')) : null,
      st === 'asked' ? h('span', { class: 'tiny ns-muted' }, T('waiting')) : null);
  }
  function person(ctx, x, changed) {
    const { h, svg } = ctx, p = S.names[x] || {};
    ctx.sheet(nameOf(x), (body, close) => {
      const done = async () => { await refresh(); close(); changed?.(); };
      const st = bond(x), pageBtn = h('span');
      Server.page(x).then(r => { if (r?.published && pageBtn.isConnected) pageBtn.replaceWith(h('button', { class: 'btn small ghost so-page', onclick: () => { close(); ctx.go('#/u/' + x); } }, svg('user'), ' ', T('theirPage'))); });
      body.append(h('div', { class: 'ns-hello so-personhead' }, face(h, p.emoji || emojiOf(x), nameOf(x), tone(x)), h('div', { class: 'grow' }, h('h2', {}, nameOf(x)), h('p', { class: 'tiny ns-muted' }, [p.university, st !== 'none' && T('bond.' + st)].filter(Boolean).join(' · ')))),
        h('div', { class: 'row so-personacts' },
          st !== 'blocked' ? h('button', { class: 'btn small primary so-msgbtn', onclick: e => busy(e.currentTarget, async () => { const r = await Server.dm(x); close(); ctx.go('#/chat/' + r); }) }, svg('chat'), ' ', T('message')) : null,
          st === 'none' ? h('button', { class: 'btn small so-askbtn', onclick: e => busy(e.currentTarget, async () => { await Server.ask(x); toast(T('asked', { name: nameOf(x) }), 3500); await done(); }) }, svg('people'), ' ', T('ask')) : null,
          st === 'theyAsked' ? h('button', { class: 'btn small', onclick: e => busy(e.currentTarget, async () => { await Server.answer(x, true); await done(); }) }, T('accept')) : null,
          st === 'asked' ? h('button', { class: 'btn small ghost', onclick: e => busy(e.currentTarget, async () => { await Server.unbuddy(x); await done(); }) }, T('cancelAsk')) : null,
          pageBtn),
        h('div', { class: 'row so-personmore' },
          st === 'buddies' ? h('button', { class: 'btn small ghost', onclick: e => { if (!confirm(T('unbuddyQ', { name: nameOf(x) }))) return; busy(e.currentTarget, async () => { await Server.unbuddy(x); await done(); }); } }, T('unbuddy')) : null,
          st === 'blocked' ? h('button', { class: 'btn small ghost', onclick: e => busy(e.currentTarget, async () => { await Server.unblock(x); await done(); }) }, T('unblock'))
            : h('button', { class: 'btn small ghost danger so-blockbtn', onclick: e => { if (!confirm(T('blockQ', { name: nameOf(x) }))) return; busy(e.currentTarget, async () => { await Server.block(x); toast(T('blockedToast', { name: nameOf(x) }), 4000); await done(); }); } }, svg('flag'), ' ', T('block'))));
    }, { cls: 'so-sheet' });
  }

  /* ---------- 🔒 privacy: findable by name, who may message or invite me; the people I blocked ---------- */
  async function privacy(ctx) {
    const { h } = ctx; const m = await ensureMe().catch(e => { fail(e); return null; }); if (!m) return;
    ctx.sheet(T('privacy'), (body, close) => {
      const find = h('input', { type: 'checkbox', class: 'so-findable', checked: m.findable || null });
      const from = h('div', { class: 'ns-seg so-dmfrom', role: 'radiogroup', 'aria-label': T('dmFrom') });
      let pick = m.dm_from || 'buddies';
      const drawFrom = () => from.replaceChildren(...['buddies', 'everyone', 'nobody'].map(k => h('button', { class: pick === k ? 'on' : '', role: 'radio', 'aria-checked': String(pick === k), 'data-v': k, onclick: () => { pick = k; drawFrom(); } }, T('from.' + k))));
      drawFrom();
      body.append(h('p', { class: 'tiny' }, T('shownAs', { name: m.display_name })),
        h('label', { class: 'ns-pfsw' }, h('span', { class: 'grow' }, h('b', {}, T('findable')), h('small', {}, T('findableSub'))), h('span', { class: 'switch' }, find, h('i'))),
        h('span', { class: 'ns-label' }, T('dmFrom')), h('p', { class: 'tiny ns-muted' }, T('dmFromSub')), from,
        h('div', { class: 'row' }, h('button', { class: 'btn primary so-saveprivacy', onclick: e => busy(e.currentTarget, async () => { await savePrivacy({ findable: find.checked, dm_from: pick }); markNoted(); toast(T('saved'), 2000); close(); }) }, T('save'))));
    }, { cls: 'so-sheet' });
  }
  async function blockedList(ctx) {
    const { h } = ctx; await refresh().catch(() => { }); await names(S.blocks).catch(() => { });
    ctx.sheet(T('blocked'), body => {
      const draw = () => body.replaceChildren(h('p', { class: 'tiny ns-muted' }, T('blockedLead')), S.blocks.length ? h('div', { class: 'ns-list' }, ...S.blocks.map(x => h('div', { class: 'ns-item' }, face(h, emojiOf(x), nameOf(x), tone(x)), h('span', { class: 't' }, h('b', {}, nameOf(x))),
        h('button', { class: 'btn small ghost', onclick: e => busy(e.currentTarget, async () => { await Server.unblock(x); await refresh(); draw(); }) }, T('unblock'))))) : h('p', { class: 'ns-muted' }, T('blockedNone')));
      draw();
    });
  }
  function about(ctx) { ctx.sheet(T('howItWorks'), body => body.append(...['about1', 'about2', 'about3', 'about4'].map(k => ctx.h('p', {}, T(k, { mb: 50 }))))); }

  /* ---------- 👥 a new study group ---------- */
  function newGroup(ctx) {
    const { h } = ctx;
    dialog(ctx, T('newGroup'), (body, close) => {
      const fld = (label, attrs, req) => { const i = h(attrs.rows ? 'textarea' : 'input', { class: 'noema-input', ...attrs }); return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label + (req ? ' *' : '')), i), i]; };
      const [nL, name] = fld(T('g.name'), { maxlength: 80, 'data-k': 'name' }, true), [aL, aboutI] = fld(T('g.about'), { maxlength: 600, rows: 2, 'data-k': 'about' });
      const [uL, uni] = fld(T('g.university'), { maxlength: 120, 'data-k': 'university' }), [cL, course] = fld(T('g.course'), { maxlength: 160, 'data-k': 'course' }), [eL, emo] = fld(T('g.emoji'), { maxlength: 4, 'data-k': 'emoji', style: { width: '5em' } });
      const err = h('div', { class: 'cg-kstat bad', role: 'alert' });
      body.append(h('p', { class: 'tiny ns-muted' }, T('newGroupLead')), nL, aL, h('div', { class: 'row' }, uL, cL), eL, err,
        h('div', { class: 'row' }, h('button', { class: 'btn primary so-create', onclick: e => { if (name.value.trim().length < 2) { err.textContent = T('needName'); return; }
          busy(e.currentTarget, async () => { const id = await Server.group({ name: name.value.trim(), about: aboutI.value.trim() || null, university: uni.value.trim() || null, course: course.value.trim() || null, emoji: emo.value.trim() || null }); close(); await refresh(); ctx.go('#/group/' + id); }); } }, T('create')),
          h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }

  /* ======================= #/chat/<room>: one conversation ======================= */
  let poll = 0;
  async function chat(ctx, rid) {
    const { h, page: pg, svg } = ctx;
    clearInterval(poll);
    const v = pg({ tab: null, crumbs: [[T('title'), '#/people'], ['…']], back: '#/people', cls: 'so-view so-chatview', fab: false }, h('p', { class: 'ns-muted' }, T('loading')));
    if (!on()) { v.replaceChildren(); return signedOut(ctx, v); }
    let room, members;
    try { [room, members] = await Promise.all([Server.room(rid), Server.members(rid)]); } catch (e) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, why(e)))); return; }
    if (!room) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, T('roomGone')), h('button', { class: 'btn', onclick: () => ctx.go('#/people') }, T('title')))); return; }
    await names(members.map(m => m.user_id)).catch(() => { });
    const myRow = members.find(m => m.user_id === me()) || {}, dm = room.kind === 'dm', other = dm ? members.find(m => m.user_id !== me())?.user_id : null;
    const title = dm ? nameOf(other) : room.name;
    const mute = async () => { await Server.member(rid, me(), { muted: !myRow.muted }); myRow.muted = !myRow.muted; toast(T(myRow.muted ? 'mutedToast' : 'unmutedToast'), 2500); refresh().catch(() => { }); };
    ctx.chrome({ tab: null, crumbs: [[T('title'), '#/people'], [title]], back: '#/people', fab: false, menu: () => dm ? [
      { label: nameOf(other), sub: T('personSub'), icon: 'user', run: () => person(ctx, other) },
      { label: T(myRow.muted ? 'unmute' : 'mute'), icon: 'bell', run: mute },
      { label: T('fromVault'), sub: T('fromVaultSub'), icon: 'vault', run: () => ctx.go('#/vault') }] : [
      { label: T('groupInfo'), sub: T('groupInfoSub'), icon: 'people', href: '#/group/' + rid },
      { label: T('groupFiles'), sub: T('groupFilesSub'), icon: 'vault', href: '#/vault?g=' + rid },
      { label: T(myRow.muted ? 'unmute' : 'mute'), icon: 'bell', run: mute }] });
    if (myRow.status === 'invited') { v.replaceChildren(h('h1', {}, title), inviteRow(ctx, { room: rid, name: room.name, emoji: room.emoji, members: members.filter(m => m.status === 'joined').length })); return; }
    const list = h('div', { class: 'so-msgs', role: 'log', 'aria-live': 'polite', 'aria-label': T('messages') });
    const earlier = h('button', { class: 'btn small ghost so-earlier', hidden: true }, T('earlier'));
    const box = h('textarea', { class: 'noema-input so-box', rows: 1, maxlength: MAX_BODY, placeholder: T('writePh'), 'aria-label': T('write') });
    const sendBtn = h('button', { class: 'btn primary so-send', 'aria-label': T('send'), title: T('send') }, svg('send'));
    const status = h('div', { class: 'tiny ns-muted so-status', role: 'status' });
    const attach = ctx.menuButton(() => [
      { label: T('att.file'), sub: T('attFileSub', { mb: 20 }), icon: 'upload', run: pickFile },
      { label: T('att.subject'), sub: T('attSubjectSub'), icon: 'book', run: () => pickSubject(ctx, s => sendSubject(s)) },
      { label: T('att.roadmap'), sub: T('attRoadmapSub'), icon: 'map', run: () => pickRoadmap(ctx, c => sendRoadmap(c)) },
      { label: T('att.vault'), sub: T('fromVaultSub'), icon: 'vault', run: () => { toast(T('fromVaultHow'), 6000); ctx.go('#/vault'); } }], { label: T('attach'), content: svg('plus'), down: false });
    const header = dm ? null : h('p', { class: 'tiny ns-muted so-grouphead' }, [room.course, room.university, T('membersN', { n: members.filter(m => m.status === 'joined').length })].filter(Boolean).join(' · '));
    put(v, header, earlier, list, status, h('div', { class: 'so-composer' }, attach, box, sendBtn));
    const msgs = new Map(), els = new Map(); let lastRead = myRow.last_read;
    const near = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    function sig(m) { return [m.body, m.edited_at, m.deleted, m.hidden].join('|'); }
    function render(scroll) {
      const sorted = [...msgs.values()].sort((a, b) => a.created_at < b.created_at ? -1 : 1);
      let prevAuthor = null, prevDay = '';
      const kids = [];
      for (const m of sorted) {
        const day = new Date(m.created_at).toDateString();
        if (day !== prevDay) { kids.push(h('div', { class: 'so-day tiny ns-muted' }, fmt(m.created_at, { weekday: 'long', day: 'numeric', month: 'long' }))); prevDay = day; prevAuthor = null; }
        let el = els.get(m.id);
        if (!el || el.dataset.sig !== sig(m) || el.dataset.head !== String(prevAuthor !== m.author)) { el = message(ctx, m, { dm, head: prevAuthor !== m.author, onChange: reload }); el.dataset.sig = sig(m); el.dataset.head = String(prevAuthor !== m.author); els.set(m.id, el); }
        kids.push(el); prevAuthor = m.author;
      }
      if (!sorted.length) kids.push(h('p', { class: 'ns-muted so-empty' }, dm ? T('dmEmpty', { name: title }) : T('groupEmpty')));
      const keep = scroll || near(); list.replaceChildren(...kids); if (keep) list.scrollTop = list.scrollHeight;
      const newest = sorted[sorted.length - 1];
      if (newest && (!lastRead || newest.created_at > lastRead) && document.visibilityState === 'visible') {
        lastRead = newest.created_at; Server.read(rid, newest.created_at).catch(() => { });
        const r = S.inbox.find(x => x.room === rid); if (r) { r.unread = 0; emit(); }
      }
    }
    async function reload(scroll = false) {
      const rows = await Server.latest(rid).catch(() => null); if (!rows || !list.isConnected) return;
      for (const m of rows) msgs.set(m.id, m);
      earlier.hidden = msgs.size < 80 || earlier.dataset.done === '1';
      render(scroll);
    }
    earlier.onclick = e => busy(e.currentTarget, async () => { const first = [...msgs.values()].sort((a, b) => a.created_at < b.created_at ? -1 : 1)[0]; const rows = await Server.before(rid, first.created_at); rows.forEach(m => msgs.set(m.id, m)); if (rows.length < 80) { earlier.dataset.done = '1'; earlier.hidden = true; } const h0 = list.scrollHeight; render(false); list.scrollTop = list.scrollHeight - h0; });
    async function send(body, att) {
      try { const m = await Server.send(rid, body, att); if (m) msgs.set(m.id, m); render(true); refresh().catch(() => { }); return true; }
      catch (e) { fail(e); return false; }
    }
    const grow = () => { box.style.height = 'auto'; box.style.height = Math.min(160, box.scrollHeight) + 'px'; };
    box.addEventListener('input', grow);
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendBtn.click(); } });
    sendBtn.onclick = async () => { const t = box.value.trim(); if (!t) return; sendBtn.disabled = true; if (await send(t)) { box.value = ''; grow(); } sendBtn.disabled = false; box.focus(); };
    async function pickFile() {
      const inp = h('input', { type: 'file', accept: V()?.FORMATS ? Object.keys(V().FORMATS).map(x => '.' + x).join(',') : '', style: { display: 'none' } });
      inp.onchange = async () => {
        const f = inp.files[0]; inp.remove(); if (!f) return;
        const used = await Server.used().catch(() => 0);
        const bad = V()?.checkFile ? await V().checkFile(f, used) : ''; if (bad) { toast('⚠️ ' + bad, 6000); return; }
        status.textContent = T('sending', { name: f.name });
        try { const path = await Server.putFile(rid, f, V().FORMATS[(f.name.toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1]][0]);
          if (!await send(box.value.trim(), { kind: 'file', path, name: f.name.slice(0, 200), mime: V().FORMATS[(f.name.toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1]][0], size: f.size })) await Server.dropFile(path).catch(() => { });
          else { box.value = ''; grow(); } }
        catch (e) { fail(e); }
        status.textContent = '';
      };
      document.body.append(inp); inp.click();
    }
    async function sendSubject(s) {
      status.textContent = T('sending', { name: s.title });
      try {
        const p = await N().loadSubject(acc(), s.id); if (!p?.subject) throw new Error(T('err.noPack'));
        const blob = new File([JSON.stringify(p)], (s.id || 'subject') + '.json', { type: 'application/json' });
        if (blob.size > 20 * 1048576) throw new Error(T('err.packBig', { mb: 20 }));
        const used = await Server.used().catch(() => 0); if (used + blob.size > 50 * 1048576) throw new Error(T('err.quota', { mb: 50 }));
        const path = await Server.putFile(rid, blob, 'application/json');
        const c = p.counts || {}, ok = await send(box.value.trim(), { kind: 'subject', path, title: p.subject.title || s.title, emoji: p.subject.emoji || null, size: blob.size, counts: { chapters: (p.chapters || []).length, exercises: c.exercises || (p.chapters || []).reduce((a, ch) => a + (ch.exercises || []).length, 0) } });
        if (!ok) await Server.dropFile(path).catch(() => { }); else { box.value = ''; grow(); }
      } catch (e) { fail(e); }
      status.textContent = '';
    }
    async function sendRoadmap(c) {
      status.textContent = T('sending', { name: c.title || c.goal });
      try {
        if (!c.shared) await SH().publish(acc(), c.id, { isPublic: false });
        else if (c.shared.role === 'member' && !c.shared.public) throw new Error(T('err.notYourRoadmap', { owner: c.shared.ownerName || T('someone') }));
        await Server.shareRoadmap(rid, c.id);
        if (await send(box.value.trim(), { kind: 'roadmap', id: c.id, title: c.title || c.goal })) { box.value = ''; grow(); }
      } catch (e) { fail(e); }
      status.textContent = '';
    }
    await reload(true);
    poll = setInterval(() => { if (!list.isConnected) { clearInterval(poll); return; } if (document.visibilityState === 'visible') reload(false); }, 4000);
  }
  /** one message: who (in a group, at the start of their run of messages), the text, an attachment, when; ⋮ edit / delete / report */
  function message(ctx, m, { dm, head, onChange }) {
    const { h } = ctx, mine = m.author === me();
    const menu = m.deleted ? null : ctx.menuButton(() => mine ? [
      m.body ? { label: T('edit'), icon: 'edit', run: () => editMsg(ctx, m, onChange) } : null,
      { label: T('delete'), icon: 'trash', danger: true, run: async () => { if (!confirm(T('deleteQ'))) return; try { await Server.remove(m.id); if (m.att?.path) await Server.dropFile(m.att.path).catch(() => { }); onChange(); } catch (e) { fail(e); } } }] : [
      m.body ? { label: T('copy'), icon: 'doc', run: () => copy(m.body, T('copied')) } : null,
      !dm ? { label: nameOf(m.author), sub: T('personSub'), icon: 'user', run: () => person(ctx, m.author) } : null,
      { label: T('report'), icon: 'flag', run: () => reportMsg(ctx, m, onChange) }], { label: T('more'), cls: 'ns-iconbtn so-msgmenu' });
    return h('div', { class: 'so-msg' + (mine ? ' mine' : '') + (m.deleted ? ' deleted' : '') + (head ? ' head' : ''), 'data-id': m.id },
      !mine && !dm && head ? h('button', { class: 'so-author tiny', onclick: () => person(ctx, m.author) }, nameOf(m.author)) : null,
      h('div', { class: 'so-bubble' },
        m.deleted ? h('i', { class: 'ns-muted' }, T('deletedMsg')) : null,
        !m.deleted && m.hidden ? h('p', { class: 'tiny so-hiddennote' }, T('hiddenMine')) : null,
        !m.deleted && m.body ? h('p', { class: 'so-text' }, m.body) : null,
        !m.deleted && m.att ? attCard(ctx, m) : null,
        h('span', { class: 'so-time tiny' }, when(m.created_at), m.edited_at && !m.deleted ? ' · ' + T('edited') : '')),
      menu);
  }
  function attCard(ctx, m) {
    const { h, svg } = ctx, a = m.att, mine = m.author === me();
    const box = h('div', { class: 'so-att so-att-' + a.kind });
    if (a.kind === 'file') {
      const ext = (String(a.name).toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || '', g = V()?.FORMATS?.[ext]?.[1] || 'doc';
      const prev = h('div', { class: 'so-attprev' });
      const get = async () => new File([await Server.blob(a.path, a.mime)], a.name, { type: a.mime });
      const canShow = ['image', 'audio', 'video'].includes(g) || a.mime === 'application/pdf';
      box.append(h('div', { class: 'so-atthead' }, svg({ image: 'eye', audio: 'mic', video: 'play', slides: 'grid', sheet: 'rows', book: 'book' }[g] || 'doc'), h('span', { class: 'grow' }, h('b', {}, a.name), h('small', { class: 'tiny ns-muted' }, ' ' + mb(a.size || 0)))),
        h('div', { class: 'row' },
          canShow ? h('button', { class: 'btn small ghost so-show', onclick: e => { const b = e.currentTarget; busy(b, async () => { const f = await get(), url = URL.createObjectURL(f); prev.replaceChildren(g === 'image' ? h('img', { src: url, alt: a.name }) : g === 'audio' ? h('audio', { src: url, controls: true }) : g === 'video' ? h('video', { src: url, controls: true }) : h('iframe', { src: url, title: a.name })); b.remove(); }); } }, svg('eye'), ' ', T('show')) : null,
          h('button', { class: 'btn small ghost so-download', onclick: e => busy(e.currentTarget, async () => { const f = await get(); const l = document.createElement('a'); l.href = URL.createObjectURL(f); l.download = a.name; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(l.href), 60000); }) }, svg('download'), ' ', T('download')),
          window.NoemaCurMap?.fromSources && ['doc', 'slides', 'text', 'image', 'book'].includes(g) ? h('button', { class: 'btn small ghost so-course', onclick: e => busy(e.currentTarget, async () => { const f = await get(); NoemaCurMap.fromSources(acc(), { files: [f], onStudy: id => N()?.open?.(id) }); }) }, svg('spark'), ' ', T('makeCourse')) : null),
        prev);
    } else if (a.kind === 'subject') {
      box.append(h('div', { class: 'so-atthead' }, h('span', { class: 'so-emo', 'aria-hidden': 'true' }, a.emoji || '📘'), h('span', { class: 'grow' }, h('b', {}, a.title), h('small', { class: 'tiny ns-muted' }, ' ' + T('subjectCounts', { ch: a.counts?.chapters || 0, ex: a.counts?.exercises || 0 })))),   // i18n-ignore (📘: a sign)
        mine ? null : h('div', { class: 'row' }, h('button', { class: 'btn small primary so-addsubj', onclick: e => busy(e.currentTarget, async () => {
          const p = JSON.parse(await (await Server.blob(a.path, 'application/json')).text());
          const have = await N().subjectsFor(acc()).catch(() => []);
          if (have.some(s => s.id === p.subject?.id)) p.subject.id = p.subject.id + '-' + String(nameOf(m.author)).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '').slice(0, 12) + '-' + Date.now().toString(36).slice(-4);
          const s = await N().importPack(acc(), p, { sharedBy: nameOf(m.author), sharedAt: new Date().toISOString() });
          toast(T('subjectAdded', { title: s.title }), 4000);
          if (confirm(T('openNow', { title: s.title }))) ctx.open(s.id);
        }) }, svg('plus'), ' ', T('addSubject'))));
    } else if (a.kind === 'roadmap') {
      const have = CU()?.get?.(acc(), a.id);
      box.append(h('div', { class: 'so-atthead' }, svg('map'), h('span', { class: 'grow' }, h('b', {}, a.title), h('small', { class: 'tiny ns-muted' }, ' ' + T('att.roadmap')))),
        h('div', { class: 'row' }, h('button', { class: 'btn small ' + (have ? 'ghost' : 'primary') + ' so-openrm', onclick: e => busy(e.currentTarget, async () => {
          if (!CU()?.get?.(acc(), a.id)) { await SH().join(acc(), a.id, { viaRoom: true }); toast(T('joinedRm', { title: a.title }), 4000); }
          ctx.go('#/map/' + enc(a.id)); }) }, have ? T('open') : T('joinRm'))));
    } else if (a.kind === 'vault') {
      box.append(h('div', { class: 'so-atthead' }, svg('vault'), h('span', { class: 'grow' }, h('b', {}, a.title), h('small', { class: 'tiny ns-muted' }, ' ' + T('att.vault')))),
        h('div', { class: 'row' }, h('button', { class: 'btn small ghost so-openvault', onclick: () => ctx.go('#/vault?id=' + enc(a.id)) }, T('open'))));
    }
    return box;
  }
  function editMsg(ctx, m, onChange) {
    const { h } = ctx;
    dialog(ctx, T('edit'), (body, close) => {
      const t = h('textarea', { class: 'noema-input', rows: 4, maxlength: MAX_BODY }); t.value = m.body;
      body.append(t, h('div', { class: 'row' }, h('button', { class: 'btn primary so-saveedit', onclick: e => { const x = t.value.trim(); if (!x && !m.att) return; busy(e.currentTarget, async () => { await Server.edit(m.id, x); close(); onChange(); }); } }, T('save')), h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }
  function reportMsg(ctx, m, onChange) {
    const { h } = ctx;
    dialog(ctx, T('reportTitle'), (body, close) => {
      const pick = h('select', { class: 'noema-input so-reason', 'aria-label': T('reason') }, ...['harassment', 'spam', 'live_exam', 'copyright', 'other'].map(r => h('option', { value: r }, T('reason.' + r))));
      const note = h('textarea', { class: 'noema-input', rows: 3, maxlength: 600, placeholder: T('reportNote') });
      body.append(h('p', { class: 'tiny ns-muted' }, T('reportLead')), pick, note, h('div', { class: 'row' },
        h('button', { class: 'btn primary so-sendreport', onclick: e => busy(e.currentTarget, async () => { await Server.report(m.id, pick.value, note.value.trim()); toast(T('reportThanks'), 4000); close(); onChange(); }) }, T('sendReport')),
        h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }
  /* the things one may send: one of my subjects (not a language course), one of my Roadmaps */
  async function pickSubject(ctx, done) {
    const { h } = ctx, list = (await N().subjectsFor(acc()).catch(() => [])).filter(s => !s.hidden && s.kind !== 'language' && !String(s.id).startsWith('lang:'));
    ctx.sheet(T('att.subject'), (body, close) => body.append(list.length ? h('div', { class: 'ns-list' }, ...list.map((s, i) => h('button', { class: 'ns-item so-pick', 'data-id': s.id, onclick: () => { close(); done(s); } }, ctx.icoTxt ? ctx.icoTxt(s.emoji || (s.title || '?').slice(0, 1), (i % 4) + 1) : null, h('span', { class: 't' }, h('b', {}, s.title), s.description ? h('small', {}, s.description) : null), ctx.chev()))) : h('p', { class: 'ns-muted' }, T('noSubjects'))));
  }
  function pickRoadmap(ctx, done) {
    const { h } = ctx, list = (CU()?.list?.(acc()) || []).filter(c => c.shared?.role !== 'member' || c.shared?.public);
    ctx.sheet(T('att.roadmap'), (body, close) => body.append(h('p', { class: 'tiny ns-muted' }, T('roadmapLead')), list.length ? h('div', { class: 'ns-list' }, ...list.map((c, i) => h('button', { class: 'ns-item so-pick', 'data-id': c.id, onclick: () => { close(); done(c); } }, ctx.ico('map', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, c.title || c.goal)), ctx.chev()))) : h('p', { class: 'ns-muted' }, T('noRoadmaps'))));
  }

  /* ======================= #/group/<room>: a study group — members, invitations, its files, its Roadmaps ======================= */
  async function group(ctx, rid) {
    const { h, page: pg, svg } = ctx;
    const v = pg({ tab: null, crumbs: [[T('title'), '#/people'], ['…']], back: '#/chat/' + rid, cls: 'so-view so-groupview' }, h('p', { class: 'ns-muted' }, T('loading')));
    if (!on()) { v.replaceChildren(); return signedOut(ctx, v); }
    let room, members, rms;
    try { [room, members, rms] = await Promise.all([Server.room(rid), Server.members(rid), Server.roadmaps(rid).catch(() => [])]); } catch (e) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, why(e)))); return; }
    if (!room || room.kind !== 'group') { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, T('roomGone')))); return; }
    await names(members.map(m => m.user_id)).catch(() => { });
    const myRole = members.find(m => m.user_id === me() && m.status === 'joined')?.role, boss = myRole === 'owner' || myRole === 'admin';
    ctx.chrome({ tab: null, crumbs: [[T('title'), '#/people'], [room.name, '#/chat/' + rid], [T('groupInfo')]], back: '#/chat/' + rid });
    const again = () => group(ctx, rid);
    const joined = members.filter(m => m.status === 'joined'), invited = members.filter(m => m.status === 'invited');
    const curs = await Server.curricula(rms.map(r => r.curriculum)).catch(() => []);
    const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };
    const memberRow = m => {
      const x = m.user_id, menu = x === me() || !boss ? null : ctx.menuButton(() => [
        myRole === 'owner' && m.role === 'member' ? { label: T('makeAdmin'), icon: 'crown', run: () => busy(null, async () => { await Server.member(rid, x, { role: 'admin' }); again(); }) } : null,
        myRole === 'owner' && m.role === 'admin' ? { label: T('unmakeAdmin'), icon: 'crown', run: () => busy(null, async () => { await Server.member(rid, x, { role: 'member' }); again(); }) } : null,
        m.role !== 'owner' && (myRole === 'owner' || m.role === 'member') ? { label: T('removeMember'), icon: 'close', danger: true, run: () => { if (confirm(T('removeQ', { name: nameOf(x) }))) busy(null, async () => { await Server.member(rid, x, { status: 'left' }); again(); }); } } : null], { label: T('more') });
      return h('div', { class: 'ns-item so-member', 'data-person': x }, h('button', { class: 'so-who', onclick: () => x !== me() && person(ctx, x, again) }, face(h, emojiOf(x), nameOf(x), tone(x)), h('span', { class: 't' }, h('b', {}, x === me() ? T('youName', { name: nameOf(x) }) : nameOf(x)), m.status === 'invited' ? h('small', {}, T('invitedNow')) : null)),
        m.role !== 'member' ? ctx.pill(T('role.' + m.role), m.role === 'owner' ? 2 : 4) : null, menu);
    };
    const linkBox = h('div', { class: 'so-linkbox' });
    const drawLink = () => linkBox.replaceChildren(room.join_code
      ? h('div', { class: 'row' }, h('button', { class: 'btn small so-copylink', onclick: () => copy(link('join/' + room.join_code), T('linkCopied')) }, svg('link'), ' ', T('copyLink')),
        boss ? h('button', { class: 'btn small ghost so-linkoff', onclick: e => busy(e.currentTarget, async () => { await Server.setRoom(rid, { join_code: null }); room.join_code = null; drawLink(); }) }, T('linkOff')) : null)
      : boss ? h('button', { class: 'btn small so-linkon', onclick: e => busy(e.currentTarget, async () => { const c = [...crypto.getRandomValues(new Uint8Array(18))].map(b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''); await Server.setRoom(rid, { join_code: c }); room.join_code = c; drawLink(); copy(link('join/' + c), T('linkCopied')); }) }, svg('link'), ' ', T('linkOn')) : h('p', { class: 'tiny ns-muted' }, T('linkNone')));
    drawLink();
    put(v,
      h('div', { class: 'ns-hello so-grouptop' }, face(h, room.emoji, room.name, tone(rid)), h('div', { class: 'grow' }, h('h1', {}, room.name), h('p', { class: 'tiny ns-muted' }, [room.course, room.university, T('membersN', { n: joined.length })].filter(Boolean).join(' · ')))),
      room.about ? h('p', { class: 'so-about' }, room.about) : null,
      ctx.fitRow ? ctx.fitRow(
        h('button', { class: 'btn small primary', onclick: () => ctx.go('#/chat/' + rid) }, svg('chat'), ' ', T('chat')),
        h('button', { class: 'btn small so-files', onclick: () => ctx.go('#/vault?g=' + rid) }, svg('vault'), ' ', T('groupFiles')),
        h('button', { class: 'btn small so-invite', onclick: () => inviteSheet(ctx, rid, members, again) }, svg('people'), ' ', T('invite')),
        boss ? h('button', { class: 'btn small ghost so-editgroup', onclick: () => editGroup(ctx, room, again) }, svg('edit'), ' ', T('edit')) : null) : null,
      h('section', { class: 'ns-panel so-sec' }, h('span', { class: 'ns-label' }, T('joinLink')), h('p', { class: 'tiny ns-muted' }, T('linkLead')), linkBox),
      h('section', { class: 'ns-panel so-sec so-rms' }, h('span', { class: 'ns-label' }, T('groupRoadmaps')),
        curs.length ? h('div', { class: 'ns-list' }, ...curs.map((c, i) => { const have = CU()?.get?.(acc(), c.id); return h('div', { class: 'ns-item', 'data-cur': c.id }, ctx.ico('map', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, c.title), h('small', {}, T('byName', { name: c.owner_name || T('someone') }))),
          h('button', { class: 'btn small ' + (have ? 'ghost' : 'primary'), onclick: e => busy(e.currentTarget, async () => { if (!CU()?.get?.(acc(), c.id)) await SH().join(acc(), c.id, { viaRoom: true }); ctx.go('#/map/' + enc(c.id)); }) }, have ? T('open') : T('joinRm'))); })) : h('p', { class: 'tiny ns-muted' }, T('noGroupRoadmaps')),
        h('button', { class: 'btn small ghost so-sharerm', onclick: () => pickRoadmap(ctx, c => busy(null, async () => {
          if (!c.shared) await SH().publish(acc(), c.id, { isPublic: false });
          await Server.shareRoadmap(rid, c.id); await Server.send(rid, '', { kind: 'roadmap', id: c.id, title: c.title || c.goal }).catch(() => { }); toast(T('rmShared', { title: c.title || c.goal }), 3500); again(); })) }, svg('plus'), ' ', T('shareRoadmap'))),
      h('section', { class: 'ns-panel so-sec' }, h('span', { class: 'ns-label' }, T('members') + ' · ' + num(joined.length)),
        h('div', { class: 'ns-list so-members' }, ...[...joined].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.joined_at < b.joined_at ? -1 : 1)).map(memberRow), ...invited.map(memberRow))),
      h('div', { class: 'row so-leave' }, h('button', { class: 'btn small ghost danger so-leavebtn', onclick: e => { if (!confirm(T('leaveQ', { name: room.name }))) return; busy(e.currentTarget, async () => { await Server.member(rid, me(), { status: 'left' }); await refresh(); ctx.go('#/people'); }); } }, T('leave'))));
  }
  function inviteSheet(ctx, rid, members, done) {
    const { h } = ctx, inRoom = new Set(members.map(m => m.user_id));
    const buddies = S.buddies.filter(b => b.status === 'buddies').map(b => b.a === me() ? b.b : b.a).filter(x => !inRoom.has(x));
    ctx.sheet(T('invite'), (body, close) => {
      const row = x => h('div', { class: 'ns-item so-person', 'data-person': x }, face(h, emojiOf(x), nameOf(x), tone(x)), h('span', { class: 't' }, h('b', {}, nameOf(x))),
        h('button', { class: 'btn small primary so-inviteone', onclick: e => { const b = e.currentTarget; busy(b, async () => { await Server.invite(rid, x); b.replaceWith(h('span', { class: 'tiny ns-muted' }, T('invitedNow'))); inRoom.add(x); }); } }, T('invite')));
      const q = h('input', { class: 'noema-input ns-srin', type: 'search', placeholder: T('findPh'), 'aria-label': T('find') }), res = h('div');
      let t = 0; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(async () => { const rows = (await Server.search(q.value).catch(() => [])).filter(p => !inRoom.has(p.user_id)); rows.forEach(p => { S.names[p.user_id] = p; }); res.replaceChildren(...rows.map(p => row(p.user_id))); }, 250); });
      body.append(h('p', { class: 'tiny ns-muted' }, T('inviteLead')), buddies.length ? h('div', { class: 'ns-list' }, ...buddies.map(row)) : h('p', { class: 'tiny ns-muted' }, T('noBuddiesToInvite')), q, res,
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => { close(); done(); } }, T('done'))));
    }, { cls: 'so-sheet' });
  }
  function editGroup(ctx, room, done) {
    const { h } = ctx;
    dialog(ctx, T('edit'), (body, close) => {
      const fld = (label, key, max, rows) => { const i = h(rows ? 'textarea' : 'input', { class: 'noema-input', maxlength: max, rows: rows || null, 'data-k': key }); i.value = room[key] || ''; return [h('label', { class: 'vt-fld' }, h('span', { class: 'ns-label' }, label), i), i]; };
      const F = [['g.name', 'name', 80], ['g.about', 'about', 600, 2], ['g.university', 'university', 120], ['g.course', 'course', 160], ['g.emoji', 'emoji', 4]].map(([l, k, m, r]) => [k, ...fld(T(l), k, m, r)]);
      body.append(...F.map(x => x[1]), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: e => { const patch = Object.fromEntries(F.map(([k, , i]) => [k, i.value.trim() || null])); if (!patch.name || patch.name.length < 2) return toast(T('needName'), 3000);
        busy(e.currentTarget, async () => { await Server.setRoom(room.id, patch); close(); await refresh(); done(); }); } }, T('save')), h('button', { class: 'btn ghost', onclick: close }, T('cancel'))));
    });
  }

  /* ======================= #/join/<code>: an invitation link ======================= */
  async function joinPage(ctx, code) {
    const { h, page: pg } = ctx;
    const v = pg({ tab: null, crumbs: [[T('title'), '#/people'], [T('joinLink')]], back: '#/people', cls: 'so-view' }, h('p', { class: 'ns-muted' }, T('loading')));
    if (!on()) { v.replaceChildren(); return signedOut(ctx, v); }
    const g = await Server.peek(code).catch(() => null);
    if (!g) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, ctx.faceEl(undefined, 'breathe'), h('p', {}, T('err.badLink')))); return; }
    if (['owner', 'admin', 'member'].includes(g.mine)) { location.replace('#/chat/' + g.id); return; }
    v.replaceChildren(h('div', { class: 'ns-panel so-joincard' }, h('div', { class: 'ns-hello' }, face(h, g.emoji, g.name, tone(g.id)), h('div', { class: 'grow' }, h('h1', {}, g.name), h('p', { class: 'tiny ns-muted' }, [g.course, g.university, T('membersN', { n: g.members })].filter(Boolean).join(' · ')))),
      g.about ? h('p', {}, g.about) : null, h('p', { class: 'tiny ns-muted' }, T('joinLead')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary so-joinnow', onclick: e => busy(e.currentTarget, async () => { const id = await Server.join(code); await refresh(); ctx.go('#/chat/' + id); }) }, T('join')), h('button', { class: 'btn ghost', onclick: () => ctx.go('#/people') }, T('cancel')))));
  }

  /* ======================= sending from elsewhere: "Send to…" (a vault file) ======================= */
  /** Pick a conversation (or a buddy without one yet) and send `att` there with an optional line. */
  async function sendTo(ctx, att, { title } = {}) {
    const { h } = ctx;
    if (!on()) { toast(T('signIn'), 5000); return; }
    await refresh().catch(() => { });
    const rooms = S.inbox.filter(r => r.status === 'joined'), withRoom = new Set(rooms.filter(r => r.kind === 'dm').map(r => r.other));
    const buddies = S.buddies.filter(b => b.status === 'buddies').map(b => b.a === me() ? b.b : b.a).filter(x => !withRoom.has(x));
    ctx.sheet(T('sendTo'), (body, close) => {
      const line = h('input', { class: 'noema-input so-sendline', maxlength: 600, placeholder: T('sendLinePh'), 'aria-label': T('write') });
      const go = (getRoom) => async e => busy(e.currentTarget, async () => { const rid = await getRoom(); await Server.send(rid, line.value.trim(), att); close(); toast(T('sent', { title: title || att.title || '' }), 3500); refresh().catch(() => { }); });
      body.append(h('p', { class: 'tiny ns-muted' }, title ? T('sendWhat', { title }) : ''), line,
        rooms.length + buddies.length ? h('div', { class: 'ns-list' }, ...rooms.map(r => h('button', { class: 'ns-item so-pick', 'data-room': r.room, onclick: go(async () => r.room) }, face(h, r.kind === 'dm' ? r.other_emoji : r.emoji, roomName(r), tone(r.room)), h('span', { class: 't' }, h('b', {}, roomName(r)), h('small', {}, r.kind === 'group' ? T('groupWord') : T('buddyWord'))), ctx.chev())),
          ...buddies.map(x => h('button', { class: 'ns-item so-pick', 'data-person': x, onclick: go(() => Server.dm(x)) }, face(h, emojiOf(x), nameOf(x), tone(x)), h('span', { class: 't' }, h('b', {}, nameOf(x)), h('small', {}, T('buddyWord'))), ctx.chev())))
          : h('p', { class: 'ns-muted' }, T('noOneYet')));
    }, { cls: 'so-sheet' });
  }
  /** my study groups (for the vault: "Share with", the group filter) → [{ id, name }] */
  async function groups() { if (!on()) return []; if (!S.loaded) await refresh().catch(() => { }); return S.inbox.filter(r => r.kind === 'group' && r.status === 'joined').map(r => ({ id: r.room, name: r.name })); }

  /** The shell's routes: people · chat · group · join */
  function page(kind, args, ctx) {
    if (kind === 'chat' && args[0]) return chat(ctx, args[0]);
    if (kind === 'group' && args[0]) return group(ctx, args[0]);
    if (kind === 'join' && args[0]) return joinPage(ctx, args[0]);
    return home(ctx);
  }
  /** Buttons for someone's page (#/u/<id>): message them, ask them to be buddies */
  function personActions(ctx, x) {
    const { h, svg } = ctx; if (!on() || x === me()) return null;
    const row = h('div', { class: 'row so-pageacts' });
    const draw = () => { const st = bond(x); put(row, 
      st !== 'blocked' ? h('button', { class: 'btn small primary', onclick: e => busy(e.currentTarget, async () => { const r = await Server.dm(x); ctx.go('#/chat/' + r); }) }, svg('chat'), ' ', T('message')) : null,
      st === 'none' ? h('button', { class: 'btn small', onclick: e => busy(e.currentTarget, async () => { await Server.ask(x); toast(T('asked', { name: nameOf(x) }), 3500); await refresh(); draw(); }) }, svg('people'), ' ', T('ask')) : st === 'theyAsked' ? h('button', { class: 'btn small', onclick: e => busy(e.currentTarget, async () => { await Server.answer(x, true); await refresh(); draw(); }) }, T('accept')) : h('span', { class: 'tiny ns-muted' }, T('bond.' + st))); };
    refresh().then(draw, draw); return row;
  }

  return { page, start, onChange, waiting, refresh, sendTo, groups, personActions, Server, bond, searchOf, why, get state() { return S; } };
})();
