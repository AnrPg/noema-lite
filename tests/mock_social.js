/* 👥 people, buddies, conversations and study groups for the e2e emulator (tests/mock_supabase.js): the tables,
   functions and bucket of cloud/supabase.sql §12 with the same rules (who sees whom, who may message whom, roles,
   attachments, three reports, the 50 MB shared with the vault). */
const crypto = require('crypto');
module.exports = function social(H) {
  const { json, filt, rls, dupe, repr, users, profiles } = H;
  const people = {}, buddies = [], blocks = [], rooms = {}, members = [], messages = [], chatFiles = [], chatObj = {}, mreports = [], roomRms = [];
  let clock = 0; const tick = () => { clock = Math.max(Date.now(), clock + 1); return new Date(clock).toISOString(); };
  const raise = (res, message, code = 'P0001') => json(res, 400, { code, message });
  const tidy = s => String(s || '').trim().replace(/\s+/g, ' ');
  const pair = (x, y) => x < y ? [x, y] : [y, x];
  const mem = (r, uid) => members.find(m => m.room === r && m.user_id === uid);
  const role = (r, uid) => { const m = mem(r, uid); return !m ? null : m.status === 'joined' ? m.role : m.status === 'invited' ? 'invited' : null; };
  const joined = (r, uid) => mem(r, uid)?.status === 'joined';
  const blocked = (x, y) => blocks.some(b => (b.blocker === x && b.blocked === y) || (b.blocker === y && b.blocked === x));
  const bud = (x, y) => { const [a, b] = pair(x, y); return buddies.find(r => r.a === a && r.b === b); };
  const mayContact = (uid, x) => !!uid && x !== uid && !blocked(uid, x) && ({ everyone: true, buddies: bud(uid, x)?.status === 'buddies', nobody: false })[people[x]?.dm_from || 'buddies'];
  const knows = (uid, x) => x === uid || !!bud(uid, x) || members.some(m => m.user_id === uid && ['joined', 'invited'].includes(m.status) && members.some(o => o.room === m.room && o.user_id === x && o.status !== 'left'));
  const seesPerson = (uid, p) => p.user_id === uid || blocks.some(b => b.blocker === uid && b.blocked === p.user_id) || (!blocked(p.user_id, uid) && (p.findable || knows(uid, p.user_id)));
  const used = uid => (H.vfiles || []).filter(f => f.uploader === uid).reduce((a, f) => a + f.size, 0) + chatFiles.filter(f => f.owner === uid).reduce((a, f) => a + f.size, 0);
  const sorted = (rows, sp) => { const o = sp.find(([k]) => k === 'order'), l = sp.find(([k]) => k === 'limit'); let out = rows.slice();
    if (o) { const [c, d] = o[1].split('.'); out.sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (d === 'desc' ? -1 : 1)); } return l ? out.slice(0, +l[1]) : out; };
  const orIlike = (rows, sp) => { const o = sp.find(([k]) => k === 'or'); if (!o) return rows;
    const terms = [...o[1].matchAll(/(\w+)\.ilike\."\*([^"]*)\*"/g)].map(m => [m[1], m[2].toLowerCase()]); return rows.filter(r => terms.some(([c, t]) => String(r[c] || '').toLowerCase().includes(t))); };
  const RM = /^rooms\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(pdf|docx?|odt|rtf|txt|md|tex|pptx?|odp|xlsx?|ods|csv|epub|png|jpe?g|gif|webp|heic|mp3|m4a|wav|ogg|flac|mp4|webm|mov|json)$/;
  const MIME = /^(application\/(pdf|json|msword|rtf|epub\+zip|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|vnd\.oasis\.opendocument\.(text|presentation|spreadsheet)|x-tex)|text\/(plain|markdown|csv|x-tex)|image\/(png|jpeg|gif|webp|heic)|audio\/(mpeg|mp4|x-m4a|wav|x-wav|ogg|flac)|video\/(mp4|webm|quicktime))$/;
  const afterMessage = m => { rooms[m.room].last_at = m.created_at; const me = mem(m.room, m.author); if (me) me.last_read = m.created_at;
    if (rooms[m.room].kind === 'dm') members.filter(x => x.room === m.room && x.status === 'left').forEach(x => { x.status = 'joined'; }); };
  const rpcs = {
    noema_buddy_ask(uid, { x }, res) {
      if (!x || x === uid || blocked(uid, x)) return raise(res, 'not possible');
      if (!people[x] || !(people[x].findable || knows(uid, x))) return raise(res, 'person not found', 'P0002');
      const r = bud(uid, x); if (r) { if (r.status === 'buddies') return 'buddies'; if (r.asked_by === uid) return 'asked'; r.status = 'buddies'; r.answered_at = tick(); return 'buddies'; }
      if (buddies.filter(b => b.asked_by === uid && b.status === 'pending').length >= 50) return raise(res, 'too many open requests');
      const [a, b] = pair(uid, x); buddies.push({ a, b, asked_by: uid, status: 'pending', created_at: tick(), answered_at: null }); return 'asked';
    },
    noema_buddy_answer(uid, { x, yes }) { const r = bud(uid, x); if (!r || r.asked_by !== x || r.status !== 'pending') return yes ? 'none' : 'declined';
      if (yes) { r.status = 'buddies'; r.answered_at = tick(); return 'buddies'; } buddies.splice(buddies.indexOf(r), 1); return 'declined'; },
    noema_dm_open(uid, { x }, res) {
      if (!x || x === uid) return raise(res, 'not possible'); const k = pair(uid, x).join(':'); let r = Object.values(rooms).find(z => z.dm_key === k);
      if (r && blocked(uid, x)) return raise(res, 'blocked');
      if (!r) { if (!mayContact(uid, x)) return raise(res, 'they do not take messages from you'); const t = tick();
        const id = crypto.randomUUID(); r = rooms[id] = { id, kind: 'dm', dm_key: k, name: null, about: null, university: null, course: null, emoji: null, join_code: null, created_by: uid, created_at: t, last_at: t };
        members.push({ room: id, user_id: uid, role: 'member', status: 'joined', invited_by: null, last_read: t, muted: false, joined_at: t }, { room: id, user_id: x, role: 'member', status: 'joined', invited_by: null, last_read: t, muted: false, joined_at: t }); }
      else { const m = mem(r.id, uid); if (m) m.status = 'joined'; }
      return r.id;
    },
    noema_group_create(uid, g, res) {
      if (Object.values(rooms).filter(r => r.created_by === uid && r.kind === 'group').length >= 10) return raise(res, 'too many new groups today');
      const name = tidy(g.name); if (name.length < 2 || name.length > 80) return raise(res, 'new row violates check constraint', '23514');
      const id = crypto.randomUUID(), t = tick(), opt = s => tidy(s) || null;
      rooms[id] = { id, kind: 'group', dm_key: null, name, about: opt(g.about), university: opt(g.university), course: opt(g.course), emoji: opt(g.emoji), join_code: null, created_by: uid, created_at: t, last_at: t };
      members.push({ room: id, user_id: uid, role: 'owner', status: 'joined', invited_by: null, last_read: t, muted: false, joined_at: t }); return id;
    },
    noema_room_invite(uid, { r, x }, res) {
      if (rooms[r]?.kind !== 'group' || !joined(r, uid)) return raise(res, 'not a member of this group');
      const m = mem(r, x); if (m && ['joined', 'invited'].includes(m.status)) return m.status;
      if (!mayContact(uid, x)) return raise(res, 'they do not take invitations from you');
      if (members.filter(z => z.room === r && ['joined', 'invited'].includes(z.status)).length >= 200) return raise(res, 'the group is full');
      const t = tick(); if (m) Object.assign(m, { status: 'invited', role: 'member', invited_by: uid }); else members.push({ room: r, user_id: x, role: 'member', status: 'invited', invited_by: uid, last_read: t, muted: false, joined_at: t });
      return 'invited';
    },
    noema_room_peek(uid, { code }) { const r = Object.values(rooms).find(z => z.kind === 'group' && z.join_code && z.join_code === code); if (!r) return [];
      return [{ id: r.id, name: r.name, about: r.about, university: r.university, course: r.course, emoji: r.emoji, members: members.filter(m => m.room === r.id && m.status === 'joined').length, mine: role(r.id, uid) }]; },
    noema_room_join(uid, { code }, res) { const r = Object.values(rooms).find(z => z.kind === 'group' && z.join_code && z.join_code === code);
      if (!r) return raise(res, 'this invitation link does not work any more', 'P0002'); if (joined(r.id, uid)) return r.id;
      if (members.filter(m => m.room === r.id && m.status === 'joined').length >= 200) return raise(res, 'the group is full');
      const m = mem(r.id, uid), t = tick(); if (m) Object.assign(m, { status: 'joined', role: 'member', joined_at: t }); else members.push({ room: r.id, user_id: uid, role: 'member', status: 'joined', invited_by: null, last_read: t, muted: false, joined_at: t });
      return r.id; },
    noema_chat_finish(uid, { p }, res) { const f = chatFiles.find(x => x.path === p && x.owner === uid); if (!f) return raise(res, 'not your file');
      const o = chatObj[p]; if (!o) return raise(res, 'the file is not uploaded yet'); if (o.data.length !== f.size) return raise(res, `size mismatch: ${o.data.length} uploaded, ${f.size} announced`);
      f.status = 'ok'; return 'ok'; },
    noema_inbox(uid) {
      return members.filter(m => m.user_id === uid && ['joined', 'invited'].includes(m.status)).map(m => {
        const r = rooms[m.room], o = r.kind === 'dm' ? members.find(x => x.room === r.id && x.user_id !== uid) : null;
        const lm = messages.filter(x => x.room === r.id && !x.hidden).sort((a, b) => a.created_at < b.created_at ? 1 : -1)[0];
        if (!(r.kind === 'group' || lm || r.created_by === uid)) return null;
        const op = o && (people[o.user_id] || profiles[o.user_id]);
        return { room: r.id, kind: r.kind, name: r.name, emoji: r.emoji, other: o?.user_id || null, other_name: op?.display_name || null, other_emoji: op?.emoji || null, status: m.status, role: m.role,
          last_at: r.last_at, last_body: lm?.body ?? null, last_author: lm?.author || null, last_kind: lm?.att?.kind || null,
          unread: messages.filter(x => x.room === r.id && x.created_at > m.last_read && x.author !== uid && !x.hidden && !x.deleted).length, muted: m.muted,
          members: members.filter(y => y.room === r.id && y.status === 'joined').length };
      }).filter(Boolean).sort((a, b) => a.last_at < b.last_at ? 1 : -1);
    },
  };
  function messageGuard(uid, m, res) {
    if (!String(m.body || '').trim() && !m.att) return raise(res, 'empty message');
    if (String(m.body || '').length > 4000) return raise(res, 'new row violates check constraint', '23514');
    const t0 = Date.now() - 60000; if (messages.filter(x => x.author === uid && Date.parse(x.created_at) > t0).length >= 30) return raise(res, 'too many messages, wait a moment');
    const r = rooms[m.room];
    if (r.kind === 'dm') { const other = members.find(x => x.room === r.id && x.user_id !== uid)?.user_id;
      if (blocked(uid, other)) return raise(res, 'blocked');
      if (!mayContact(uid, other) && !messages.some(x => x.room === r.id && x.author === other)) return raise(res, 'they do not take messages from you'); }
    const a = m.att; if (a) { const k = a.kind;
      if (!['file', 'subject', 'roadmap', 'vault'].includes(k)) return raise(res, 'new row violates check constraint', '23514');
      if ((k === 'file' || k === 'subject') && !chatFiles.some(f => f.path === a.path && f.room === m.room && f.owner === uid && f.status === 'ok' && (k === 'subject') === (f.mime === 'application/json'))) return raise(res, 'attachment not found');
      if (k === 'roadmap' && !roomRms.some(x => x.room === m.room && x.curriculum === a.id)) return raise(res, 'attachment not found');
      if (k === 'vault' && !(H.vfiles || []).some(v => v.id === a.id && v.status === 'ok' && (!v.room || v.room === m.room))) return raise(res, 'attachment not found'); }
    return true;
  }
  function memberGuard(uid, old, patch, res) {
    const nx = { ...old, ...patch };
    for (const k of ['room', 'user_id', 'invited_by', 'joined_at']) if (nx[k] !== old[k]) return raise(res, 'not allowed');
    if (old.user_id === uid) {
      if (nx.role !== old.role) return raise(res, 'not allowed');
      if (nx.status !== old.status && !((old.status === 'invited' && ['joined', 'left'].includes(nx.status)) || (old.status === 'joined' && nx.status === 'left'))) return raise(res, 'not allowed');
      if (old.status === 'invited' && nx.status === 'joined') { nx.joined_at = tick(); nx.last_read = nx.joined_at; }
      if (nx.status === 'left' && old.role === 'owner') { nx.role = 'member';
        const heir = members.filter(m => m.room === old.room && m.user_id !== uid && m.status === 'joined').sort((a, b) => ((b.role === 'admin') - (a.role === 'admin')) || (a.joined_at < b.joined_at ? -1 : 1))[0];
        if (heir) heir.role = 'owner'; }
      return nx;
    }
    const my = role(old.room, uid);
    if (nx.last_read !== old.last_read || nx.muted !== old.muted) return raise(res, 'not allowed');
    if (nx.status !== old.status && !(nx.status === 'left' && (my === 'owner' || (my === 'admin' && old.role === 'member')))) return raise(res, 'not allowed');
    if (nx.role !== old.role && !(my === 'owner' && ['admin', 'member'].includes(nx.role) && old.role !== 'owner')) return raise(res, 'not allowed');
    return nx;
  }
  function handle(req, res, p, u, uid, data, buf) {
    const M = req.method, sp = [...u.searchParams.entries()]; let m;
    if (!/^\/(rest\/v1\/(noema_(people|buddies|blocks|rooms|room_members|messages|message_reports|chat_files|room_roadmaps)|rpc\/(noema_(buddy_ask|buddy_answer|dm_open|group_create|room_invite|room_peek|room_join|chat_finish|inbox)))|storage\/v1\/object\/(authenticated\/)?noema-chat)\b/.test(p)) return;
    if (!uid) return json(res, 401, { message: 'JWT required' });
    if ((m = p.match(/^\/rest\/v1\/rpc\/(\w+)$/))) { const out = rpcs[m[1]](uid, data || {}, res); if (res.headersSent) return; return json(res, 200, out); }
    if (p === '/rest/v1/noema_people') {
      if (M === 'GET') return json(res, 200, sorted(orIlike(filt(Object.values(people).filter(x => seesPerson(uid, x)), sp), sp), sp));
      if (M === 'POST') { for (const r of data) { if (r.user_id && r.user_id !== uid) return rls(res); const name = tidy(r.display_name); if (!name || name.length > 80) return raise(res, 'new row violates check constraint', '23514');
        people[uid] = { findable: true, dm_from: 'buddies', emoji: null, search: null, university: null, ...(people[uid] || {}), ...r, user_id: uid, display_name: name, updated_at: tick() }; } return json(res, 201); }
      if (M === 'PATCH') { for (const r of filt(Object.values(people).filter(x => x.user_id === uid), sp)) { if (data.dm_from && !['buddies', 'everyone', 'nobody'].includes(data.dm_from)) return raise(res, 'new row violates check constraint', '23514'); Object.assign(r, data, { user_id: uid, updated_at: tick() }); if (data.display_name) r.display_name = tidy(data.display_name); } return json(res, 204); }
    }
    if (p === '/rest/v1/noema_buddies') {
      const mine = filt(buddies.filter(b => [b.a, b.b].includes(uid)), sp);
      if (M === 'GET') return json(res, 200, mine);
      if (M === 'DELETE') { for (const b of mine) buddies.splice(buddies.indexOf(b), 1); return json(res, 204); }
      return rls(res);
    }
    if (p === '/rest/v1/noema_blocks') {
      const mine = filt(blocks.filter(b => b.blocker === uid), sp);
      if (M === 'GET') return json(res, 200, mine);
      if (M === 'POST') { for (const r of data) { if ((r.blocker && r.blocker !== uid) || r.blocked === uid) return rls(res); if (blocks.some(b => b.blocker === uid && b.blocked === r.blocked)) return dupe(res);
        blocks.push({ blocker: uid, blocked: r.blocked, created_at: tick() }); const b = bud(uid, r.blocked); if (b) buddies.splice(buddies.indexOf(b), 1); } return json(res, 201); }
      if (M === 'DELETE') { for (const b of mine) blocks.splice(blocks.indexOf(b), 1); return json(res, 204); }
    }
    if (p === '/rest/v1/noema_rooms') {
      const vis = filt(Object.values(rooms).filter(r => role(r.id, uid)), sp);
      if (M === 'GET') return json(res, 200, vis);
      if (M === 'PATCH') { for (const r of vis) { if (r.kind !== 'group' || !['owner', 'admin'].includes(role(r.id, uid))) continue;
        const nx = { ...r, ...data, id: r.id, kind: r.kind, dm_key: r.dm_key, created_by: r.created_by, created_at: r.created_at, last_at: r.last_at }; nx.name = tidy(nx.name);
        if (nx.name.length < 2 || nx.name.length > 80 || (nx.join_code != null && !/^[A-Za-z0-9]{12,40}$/.test(nx.join_code))) return raise(res, 'new row violates check constraint', '23514');
        if (nx.join_code && Object.values(rooms).some(z => z.id !== r.id && z.join_code === nx.join_code)) return dupe(res); Object.assign(r, nx); } return json(res, 204); }
    }
    if (p === '/rest/v1/noema_room_members') {
      const vis = filt(members.filter(x => x.user_id === uid || joined(x.room, uid)), sp);
      if (M === 'GET') return json(res, 200, vis);
      if (M === 'PATCH') { for (const x of vis) { if (!(x.user_id === uid || ['owner', 'admin'].includes(role(x.room, uid)))) continue; const nx = memberGuard(uid, x, data, res); if (res.headersSent) return; Object.assign(x, nx); } return json(res, 204); }
    }
    if (p === '/rest/v1/noema_messages') {
      if (M === 'GET') return json(res, 200, sorted(filt(messages.filter(x => joined(x.room, uid) && (!x.hidden || x.author === uid)), sp), sp));
      if (M === 'POST') { const out = []; for (const r of data) { if ((r.author && r.author !== uid) || !rooms[r.room] || !joined(r.room, uid)) return rls(res);
        if (messageGuard(uid, r, res) !== true) return; const row = { id: crypto.randomUUID(), room: r.room, author: uid, body: r.body || '', att: r.att || null, created_at: tick(), edited_at: null, deleted: false, hidden: false, reports: 0 };
        messages.push(row); afterMessage(row); out.push(row); } return repr(req, res, 201, out); }
      if (M === 'PATCH') { for (const x of filt(messages.filter(y => y.author === uid), sp)) { if (x.deleted) return raise(res, 'deleted');
        if (data.deleted) { Object.assign(x, { deleted: true, body: '', att: null, edited_at: tick() }); continue; }
        if (data.body != null && data.body !== x.body) { if (!String(data.body).trim() && !x.att) return raise(res, 'empty message'); x.body = data.body; x.edited_at = tick(); } } return json(res, 204); }
    }
    if (p === '/rest/v1/noema_message_reports') {
      if (M === 'GET') return json(res, 200, mreports.filter(r => r.reporter === uid));
      if (M === 'POST') { for (const r of data) { const msg = messages.find(x => x.id === r.message);
        if ((r.reporter && r.reporter !== uid) || !msg || !joined(msg.room, uid) || msg.author === uid) return rls(res);
        if (!['harassment', 'spam', 'live_exam', 'copyright', 'other'].includes(r.reason)) return raise(res, 'new row violates check constraint', '23514');
        if (mreports.some(x => x.message === r.message && x.reporter === uid)) return dupe(res);
        mreports.push({ message: r.message, reporter: uid, reason: r.reason, note: r.note || null, at: tick() }); msg.reports = mreports.filter(x => x.message === msg.id).length; if (msg.reports >= 3) msg.hidden = true; } return json(res, 201); }
    }
    if (p === '/rest/v1/noema_chat_files') {
      const vis = filt(chatFiles.filter(f => f.owner === uid || joined(f.room, uid)), sp);
      if (M === 'GET') return json(res, 200, vis);
      if (M === 'POST') { for (const r of data) { const g = RM.exec(r.path || '');
        if ((r.owner && r.owner !== uid) || !joined(r.room, uid)) return rls(res);
        if (!g || !MIME.test(r.mime || '') || !(r.size > 0 && r.size <= 20971520) || !r.name) return raise(res, 'new row violates check constraint', '23514');
        if (g[1] !== r.room) return raise(res, 'wrong folder'); const u0 = used(uid); if (u0 + r.size > 52428800) return raise(res, `storage quota: ${u0} of 52428800 bytes used`);
        if (chatFiles.some(f => f.path === r.path)) return dupe(res); chatFiles.push({ path: r.path, room: r.room, owner: uid, name: r.name, mime: r.mime, size: r.size, status: 'pending', created_at: tick() }); } return json(res, 201); }
      if (M === 'DELETE') { for (const f of vis.filter(f => f.owner === uid)) chatFiles.splice(chatFiles.indexOf(f), 1); return json(res, 204); }
    }
    if (p === '/rest/v1/noema_room_roadmaps') {
      const vis = filt(roomRms.filter(x => joined(x.room, uid)), sp);
      if (M === 'GET') return json(res, 200, vis);
      if (M === 'POST') { for (const r of data) { const c = H.curs[r.curriculum];
        if ((r.added_by && r.added_by !== uid) || !joined(r.room, uid) || !c || !(c.owner === uid || c.public)) return rls(res);
        if (roomRms.some(x => x.room === r.room && x.curriculum === r.curriculum)) { if (/ignore-duplicates/.test(req.headers.prefer || '')) continue; return dupe(res); }
        roomRms.push({ room: r.room, curriculum: r.curriculum, added_by: uid, at: tick() }); } return json(res, 201); }
      if (M === 'DELETE') { for (const x of vis) if (x.added_by === uid || ['owner', 'admin'].includes(role(x.room, uid))) roomRms.splice(roomRms.indexOf(x), 1); return json(res, 204); }
    }
    if ((m = p.match(/^\/storage\/v1\/object\/noema-chat\/(.+)$/)) && ['POST', 'PUT'].includes(M)) { const k = decodeURIComponent(m[1]); if (!chatFiles.some(f => f.path === k && f.owner === uid)) return rls(res);
      if (buf.length > 20971520) return json(res, 413, { message: 'Payload too large' }); chatObj[k] = { data: buf, type: req.headers['content-type'] }; return json(res, 200, { Key: 'noema-chat/' + k }); }
    if ((m = p.match(/^\/storage\/v1\/object\/authenticated\/noema-chat\/(.+)$/))) { const k = decodeURIComponent(m[1]);
      if (!chatFiles.some(f => f.path === k && (f.owner === uid || (f.status === 'ok' && joined(f.room, uid)))) || !chatObj[k]) return json(res, 404, { message: 'Object not found' });
      res.writeHead(200, { 'Content-Type': chatObj[k].type || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }); return res.end(chatObj[k].data); }
    if (p === '/storage/v1/object/noema-chat' && M === 'DELETE') { for (const k of data.prefixes || []) if (chatFiles.some(f => f.path === k && f.owner === uid)) delete chatObj[k]; return json(res, 200, []); }
    return json(res, 404, { message: 'not found ' + p });
  }
  /** a Roadmap shared in one of my rooms is 'public' for me (noema_cur_access) */
  const roadmapInMyRoom = (cid, uid) => !!uid && roomRms.some(x => x.curriculum === cid && joined(x.room, uid));
  return { handle, joined, used, roadmapInMyRoom, state: { people, buddies, blocks, rooms, members, messages, chatFiles, chatObj, mreports, roomRms } };
};
