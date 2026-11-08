/* noema-lite — sharing and Explore: the 🔔 shares, invitations and updates, a subject shared or published, Explore and Discover, the search and the vault pages, people, the page others see (Me › Profile, #/u/<id>) and the admins' pages.
   An area of the app on the shell (build/ui.js: window.Noema, window.NoemaShell; docs/ARCHITECTURE.md §6.3): it adds its
   parts to Noema, its pages to the frame (NoemaShell.registerPage) and its steps of the start to Noema.boot. Whatever
   another area needs of it goes through Noema.app (APP). */
(() => {
  'use strict';
  const APP = (window.Noema.app ||= {});
  {
  const N = window.Noema;
  const CFG = N.config;
  const REG = N.registry;
  const P = 'noema1:';
  const KV = N.kv;
  const IDB = N.idb;
  const Noema = N;
  const jget = N.jget;
  const el = N.el;
  const slugify = N.slugify;
  const tr = N.tr;
  const trx = N.trx;
  const errMsg = N.errMsg;
  const overlay = N.overlay;
  const brandHead = N.brandHead;
  const toastL = (m, ms) => N.toast(m, ms);
  const getAccount = N.getAccount;
  const Notices = N.notices;
  const ls = { get: k => NoemaCore.storage.kv.get(k), set: (k, v) => NoemaCore.storage.kv.set(k, v), del: k => NoemaCore.storage.kv.delete(k), keys: prefix => NoemaCore.storage.kv.keys(prefix) };
  const UPDATE_KINDS = ['curupdate', 'stepupdate', 'subjupdate'];
  const countPack = (...a) => APP.countPack(...a);
  const embedWebPictures = (...a) => APP.embedWebPictures(...a);
  const exportPackage = (...a) => APP.exportPackage(...a);
  const getPack = (...a) => APP.getPack(...a);
  const inlineTranslations = (...a) => APP.inlineTranslations(...a);
  const langTag = (...a) => APP.langTag(...a);
  const localizedSubject = (...a) => APP.localizedSubject(...a);
  const storeTranslations = (...a) => APP.storeTranslations(...a);
  const subjectsFor = (...a) => APP.subjectsFor(...a);
  /* ---------------- Sharing, Explore & notifications (docs/SHARING.md) ---------------- */
  const fmtN = n => window.NoemaI18n ? NoemaI18n.fmt.number(Number(n || 0)) : String(Number(n || 0));
  const num = n => Number(n || 0);   // a count for a plural message (never undefined)
  /** A day / a moment in the UI locale (the same numeric forms as toLocaleDateString() / toLocaleString()). */
  const DAY_O = { year: 'numeric', month: 'numeric', day: 'numeric' }, WHEN_O = { ...DAY_O, hour: 'numeric', minute: 'numeric', second: 'numeric' };
  const fmtDay = d => window.NoemaI18n ? NoemaI18n.fmt.date(d, DAY_O) : new Date(d).toLocaleDateString();
  const fmtWhen = d => window.NoemaI18n ? NoemaI18n.fmt.date(d, WHEN_O) : new Date(d).toLocaleString();
  const isCloudAcc = acc => !!(window.NoemaCloud && NoemaCloud.session() && acc === 'u_' + NoemaCloud.session().user.id);
  /** Everything another learner wants to know before choosing a subject (stored with public packs and shares). */
  function packInfo(p, acc) {
    const ch = p.chapters || [];
    const media = p.media || {};
    const exN = ch.reduce((a, c) => a + (c.exercises || []).length, 0);
    return {
      counts: { chapters: ch.length, sections: ch.reduce((a, c) => a + (c.sections || []).length, 0), exercises: exN,
        visual: ch.reduce((a, c) => a + (c.exercises || []).filter(e => /^img_/.test(e.type)).length, 0), flashcards: ch.reduce((a, c) => a + (c.flashcards || []).length, 0),
        playbooks: ch.reduce((a, c) => a + (c.debug || []).length, 0), pictures: Object.keys(media).length },
      chapters: ch.map(c => ({ num: c.num, title: c.title, emoji: c.emoji || '', sections: (c.sections || []).length, exercises: (c.exercises || []).length })),
      sources: ((p.sources && p.sources.sources) || []).map(s => ({ title: s.title, subtitle: s.subtitle || '', pages: s.pages || '', url: /^https?:/.test(s.url || '') ? s.url : (/^https?:/.test(s.file || '') ? s.file : '') })),
      restricted: Object.values(media).filter(m => m.restricted).length,
      language: p.subject.language || '', version: p.version || null, sizeKB: Math.round(JSON.stringify(p).length / 1024),
      ownerName: (getAccount(acc) || {}).name || '', math: !!p.subject.features?.math, code: !!p.subject.features?.code,
      ...(p.subject.i18n ? { i18n: p.subject.i18n } : {}), ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}),   // docs/i18n.md §10
    };
  }
  /** A readable info card: stats, chapters (numbered list), sources (with links). */
  /** The chapter list as Markdown (numbered), rendered and sanitised, in a fixed-height scroll box. */
  const mdEsc = t => String(t || '').replace(/([\\`*_[\]<>#|])/g, '\\$1');
  function chaptersBox(chs) {
    const md = chs.map((ch, i) => `${i + 1}. ${ch.emoji ? ch.emoji + ' ' : ''}**${mdEsc(ch.title)}**${ch.sections || ch.exercises ? ` — *${mdEsc(tr('loader.info.chapterCounts', { sections: num(ch.sections), exercises: num(ch.exercises) }))}*` : ''}`).join('\n');
    const box = el('div', { class: 'nx-chapters', tabindex: '0', 'aria-label': tr('loader.info.chapters') });
    if (window.marked && window.DOMPurify) box.innerHTML = DOMPurify.sanitize(marked.parse(md));
    else box.append(el('ol', {}, ...chs.map(ch => el('li', {}, (ch.emoji ? ch.emoji + ' ' : '') + ch.title))));
    return box;
  }
  function infoCard(s, m) {
    const c = (m && m.counts) || s.counts || {};
    const stat = (v, k) => v ? el('div', { class: 'nx-stat' }, el('b', {}, fmtN(v)), el('span', {}, tr(k, { n: num(v) }))) : null;
    return el('div', { class: 'nx-info' },
      el('div', { class: 'nx-infohead' }, el('span', { class: 'nx-emo' }, s.emoji || '📘'), el('div', {}, el('h3', {}, s.title), el('div', { class: 'tiny' }, [s.owner_name || (m && m.ownerName) ? '👤 ' + (s.owner_name || m.ownerName) : '📚 ' + tr('loader.info.library'), m && m.language || s.language ? '🗣️ ' + (window.NoemaI18n ? NoemaI18n.fmt.langName(m && m.language || s.language) : (m && m.language || s.language)) : '', m && m.sizeKB ? `💾 ${fmtN(m.sizeKB)} KB` : ''].filter(Boolean).join(' · ')))),   // i18n-ignore (KB: a unit)
      s.description ? el('p', { class: 'nx-desc' }, s.description) : null,
      el('div', { class: 'nx-stats' }, stat(c.chapters, 'loader.info.stat.chapters'), stat(c.sections, 'loader.info.stat.sections'), stat(c.exercises, 'loader.info.stat.exercises'), stat(c.visual, 'loader.info.stat.visual'), stat(c.pictures || c.media, 'loader.info.stat.pictures'), stat(c.flashcards, 'loader.info.stat.flashcards'), stat(c.playbooks, 'loader.info.stat.playbooks')),
      m && m.chapters && m.chapters.length ? el('div', {}, el('div', { class: 'nx-lbl' }, '📖 ' + tr('loader.info.nChapters', { n: m.chapters.length })), chaptersBox(m.chapters)) : null,
      m && m.sources && m.sources.length ? el('div', {}, el('div', { class: 'nx-lbl' }, '📚 ' + tr('loader.info.sources')), el('ul', { class: 'nx-sources' }, ...m.sources.map(x => el('li', {}, x.url ? el('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title + ' ↗') : x.title, x.subtitle ? el('span', { class: 'tiny' }, ' — ' + x.subtitle) : null, x.pages ? el('span', { class: 'tiny' }, ' ' + tr('loader.info.pages', { pages: x.pages })) : null)))) : null,
      m && m.sourceFiles ? el('p', { class: 'tiny' }, '📎 ' + (m.sourceBytes ? tr('loader.info.sourceFilesSize', { n: num(m.sourceFiles), size: fmtMB(m.sourceBytes) }) : tr('loader.info.sourceFiles', { n: num(m.sourceFiles) }))) : null,
      m && m.restricted ? el('p', { class: 'tiny' }, '🔒 ' + tr('loader.info.restricted', { n: m.restricted })) : null);
  }
  /** Turn a pack object into one of the account's subjects (local + cloud). */
  async function importPack(acc, p, extra = {}) {
    if (N.migrate.OLD_FORMATS.packFormats.includes(p.format)) p.format = 'noema-pack';   // a pack of the app's name before noema-lite
    if (p.format !== 'noema-pack' || !p.subject?.id || !Array.isArray(p.chapters)) throw new Error(tr('loader.import.notPack'));
    p.counts = p.counts || countPack(p);
    if (p.sharedFiles) { Object.defineProperty(p, '_sharedFiles', { value: p.sharedFiles, enumerable: false, configurable: true }); delete p.sharedFiles; }   // fetched by the caller (attachShared), not stored
    await embedWebPictures(acc, p);
    await storeTranslations(acc, p);   // translations in their own files (docs/i18n.md §10)
    await IDB.put('packs', acc + '|' + p.subject.id, p);
    KV.set(KV.accountKey('packmeta:' + p.subject.id, acc), JSON.stringify({ ...p.subject, counts: p.counts, version: p.version || null, ...(p.translations ? { contentLocales: Object.keys(p.translations) } : {}), ...extra }));
    if (isCloudAcc(acc)) await NoemaCloud.uploadPack(p).catch(e => console.warn(e));
    window.NoemaCurriculum?.Edit?.refreshAssigned?.(acc, p.subject.id, p);   // 📦 a new version of a subject that teaches steps: those steps follow it
    return { ...p.subject, origin: 'imported', counts: p.counts, ...extra };
  }

  /** The source files that came with a shared / public subject → this account (device + cloud). */
  async function attachSharedFiles(acc, p, bucket) {
    const f = p._sharedFiles; if (!f || !Object.keys(f).length || !window.NoemaSrcFiles) return;
    toastL('📎 ' + tr('loader.files.getting', { n: Object.keys(f).length }), 2500);
    const r = await NoemaSrcFiles.attachShared(acc, { ...p, sharedFiles: f }, bucket);
    if (r.failed.length) toastL('⚠️ ' + tr('loader.files.failed', { n: r.failed.length, files: r.failed.join(', ') }), 6000);
  }
  const fmtMB = n => n >= 1048576 ? (window.NoemaI18n ? NoemaI18n.fmt.number(n / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : (n / 1048576).toFixed(1)) + ' MB' : fmtN(Math.max(1, Math.round(n / 1024))) + ' KB';

  /* ---- 🔗 share dialog: public + with a person ---- */
  async function shareDialog(acc, s) {
    let pack; try { pack = await inlineTranslations(acc, s, await getPack(acc, s)); } catch (e) { toastL('⚠️ ' + errMsg(e), 4000); return; }   // a shared or public copy carries its translations (docs/i18n.md §10)
    const meta = packInfo(pack, acc);
    overlay((box, close) => {
      const draw = async () => {
        box.innerHTML = '';
        box.append(brandHead('🔗 ' + tr('loader.share.title', { title: s.title }), tr('loader.share.counts', { chapters: num(meta.counts.chapters), exercises: num(meta.counts.exercises), pictures: num(meta.counts.pictures) })));
        if (!isCloudAcc(acc)) {
          box.append(el('div', { class: 'noema-form' }, el('p', {}, '☁️ ' + tr('loader.share.needsCloud')),
            el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => exportPackage(acc, pack) }, '⬇️ ' + tr('loader.share.download')))),
            el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
          return;
        }
        const warn = meta.restricted ? el('label', { class: 'nx-warn' }, el('input', { type: 'checkbox', id: 'nx-ack' }), ' ⚠️ ' + tr('loader.share.restricted', { n: meta.restricted })) : null;
        const acked = () => !warn || warn.querySelector('input').checked;
        // the subject's source files (PDFs…) go with it, unless the learner unticks it
        const fx = window.NoemaSrcFiles ? Object.values(NoemaSrcFiles.index(acc, s.id)) : [];
        const withFiles = el('input', { type: 'checkbox', checked: true });
        const filesRow = fx.length ? el('label', { class: 'nx-files' }, withFiles, ' 📎 ' + tr('loader.share.includeFiles', { n: fx.length, size: fmtMB(fx.reduce((a, m) => a + (m.size || 0), 0)) })) : null;
        const prog = el('div', { class: 'tiny' });
        const files = async () => { const sources = fx.length > 0 && withFiles.checked, acts = NoemaSrcFiles.h5pItems(pack).length > 0; if (!sources && !acts) return []; prog.textContent = '⏳ ' + tr('loader.share.preparingFiles'); return NoemaSrcFiles.forSharing(acc, s.id, { pack, sources }); };   // h5p@1: an item's .h5p file is the activity itself: it always goes with it
        const onProgress = (k, n, name) => { prog.textContent = '⬆️ ' + tr('loader.share.uploading', { k: Math.min(n, Math.floor(k) + 1), n, name }); };
        const mine = await NoemaCloud.myPublished().catch(() => []);
        const pub = (mine || []).find(r => r.subject_id === s.id);
        const pubBox = el('div', { class: 'nx-sec' }, el('h4', {}, '🌍 ' + tr('loader.share.public'), el('span', { class: 'nx-tip', title: tr('loader.share.publicTip') }, 'ⓘ')),
          el('p', { class: 'tiny' }, pub ? tr('loader.share.publicSince', { date: fmtDay(pub.updated_at) }) : tr('loader.share.onlyYou')),
          el('div', { class: 'row' }, pub
            ? [el('button', { class: 'btn small', onclick: async e => { if (!acked()) return warn.classList.add('shake'); e.currentTarget.disabled = true; try { await NoemaCloud.publish(pack, meta, { files: await files(), onProgress }); toastL('🌍 ' + tr('loader.share.updated')); } catch (er) { toastL('⚠️ ' + errMsg(er), 5000); } draw(); } }, '🔄 ' + tr('loader.share.publishNewest')),
               el('button', { class: 'btn small ghost', onclick: async e => { e.currentTarget.disabled = true; await NoemaCloud.unpublish(s.id); toastL(tr('loader.share.withdrawn')); draw(); } }, tr('loader.share.withdraw'))]
            : el('button', { class: 'btn small primary', onclick: async e => { if (!acked()) { warn.classList.remove('shake'); void warn.offsetWidth; warn.classList.add('shake'); return; } const b = e.currentTarget; b.disabled = true; try { await NoemaCloud.publish(pack, meta, { files: await files(), onProgress }); toastL('🌍 ' + tr('loader.share.publicNow')); draw(); } catch (er) { b.disabled = false; toastL('⚠️ ' + errMsg(er), 5000); } } }, '🌍 ' + tr('loader.share.makePublic'))));
        const email = el('input', { class: 'noema-input', type: 'email', placeholder: tr('loader.share.emailPlaceholder') });
        const msg = el('input', { class: 'noema-input', placeholder: tr('loader.share.msgPlaceholder'), maxlength: 200 });
        const status = el('div', { class: 'tiny' });
        const sent = el('div', { class: 'nx-sent' });
        const personBox = el('div', { class: 'nx-sec' }, el('h4', {}, '👤 ' + tr('loader.share.person'), el('span', { class: 'nx-tip', title: tr('loader.share.personTip') }, 'ⓘ')),
          email, msg, el('div', { class: 'row' }, el('button', { class: 'btn small primary', onclick: async e => {
            if (!acked()) { warn.classList.remove('shake'); void warn.offsetWidth; warn.classList.add('shake'); return; }
            const b = e.currentTarget; b.disabled = true; status.textContent = tr('loader.share.sending');
            try { await NoemaCloud.shareWith(email.value, pack, meta, msg.value.trim(), { files: await files(), onProgress }); prog.textContent = ''; status.textContent = '✅ ' + tr('loader.share.sent', { email: email.value.trim().toLowerCase() }); email.value = ''; msg.value = ''; drawSent(); }
            catch (er) { status.textContent = '⚠️ ' + errMsg(er); } finally { b.disabled = false; }
          } }, '📨 ' + tr('loader.share.send'))), status, sent);
        const drawSent = async () => {
          const rows = ((await NoemaCloud.outgoingShares().catch(() => [])) || []).filter(r => r.subject_id === s.id);
          sent.innerHTML = ''; if (!rows.length) return;
          sent.append(el('div', { class: 'nx-lbl' }, tr('loader.share.sentList')), ...rows.map(r => el('div', { class: 'nx-sentrow' }, el('span', { class: 'grow' }, r.to_email), el('span', { class: 'pill nx-st-' + r.status }, ({ pending: '⏳ ', accepted: '✅ ', rejected: '✖ ', revoked: '↩ ' }[r.status] || '') + tr('loader.share.status', { status: r.status })),
            r.status === 'pending' ? el('button', { class: 'btn small ghost', onclick: async () => { await NoemaCloud.revokeShare(r.id, r.meta?.filePaths || []); drawSent(); } }, tr('loader.share.withdraw')) : null)));
        };
        box.append(warn, filesRow, prog, pubBox, personBox, el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
        drawSent();
      };
      draw();
    });
  }

  /* ---- 🌍 Explore: every public subject (library + published by users) ---- */
  /** every public subject (library + published by users) and how to study one: the shell's Explore page and the dialog below */
  async function publicSubjects(acc) {
    let pub = [];
    try { if (window.NoemaCloud && CFG.supabaseUrl) pub = (await NoemaCloud.listPublic()) || []; } catch (e) { console.warn('[explore]', e.message); }
    const mine = new Map((await subjectsFor(acc)).map(s => [s.id, s]));
    const lib = (REG.subjects || []).filter(s => !s.owner).map(localizedSubject).map(s => ({ kind: 'library', id: s.id, title: s.title, emoji: s.emoji, description: s.description, language: s.language, contentLang: s.contentLang, counts: s.counts, meta: { counts: s.counts, chapters: s.chapters, sources: s.sources, language: s.language } }));
    const users = pub.map(r => { const L = localizedSubject({ title: r.title, description: r.description, language: r.language || undefined, i18n: r.meta?.i18n, contentLocales: r.meta?.contentLocales });
      return { kind: 'public', id: r.subject_id, owner: r.owner, owner_name: r.owner_name, title: L.title, emoji: r.emoji, description: L.description, language: r.language, contentLang: L.contentLang, counts: r.meta?.counts || {}, meta: r.meta || {}, updated_at: r.updated_at }; });
    const all = [...lib, ...users].map(s => ({ ...s, domain: window.NoemaCurriculum?.domainOf ? NoemaCurriculum.domainOf({ group: s.group || s.meta?.group || (REG.subjects || []).find(x => x.id === s.id)?.group, title: s.title, description: s.description }) : 'other' }));
    const study = async (s, choose) => {
      if (s.kind === 'library') return choose(s);
      const have = mine.get(s.id);
      if (have && have.origin !== 'library' && (have.version || null) === (s.meta.version || null)) return choose(have);
      toastL('⬇️ ' + tr('loader.explore.getting', { title: s.title }));
      const r = await fetch(NoemaCloud.publicPackUrl(s.owner, s.id)); if (!r.ok) throw new Error(tr('loader.explore.downloadFailed', { status: r.status }));
      const p = await r.json(); if (REG.subjects.some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(s.owner_name || 'shared');
      const added = await importPack(acc, p, { publicFrom: s.owner, publicOwner: s.owner_name || '', publicId: s.id, publicAt: s.updated_at || null });
      await attachSharedFiles(acc, p, 'noema-public');
      toastL('📥 ' + tr('loader.explore.added', { title: p.subject.title })); choose(added);
    };
    return { all, study };
  }
  async function explore(acc, { onChoose } = {}) {
    const choose = onChoose || (s => Noema.switchTo(acc, s.id));
    const { all, study: studyIt } = await publicSubjects(acc), study = s => studyIt(s, choose);
    overlay((box, close) => {
      const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 ' + tr('loader.explore.search'), oninput: () => draw() });
      const grid = el('div', { class: 'nx-grid' });
      const tipCard = el('div', { class: 'nx-hover' });
      const touch = matchMedia('(hover: none)').matches;   // i18n-ignore (a media query)
      const pick = async s => { hideTip(); close(); try { await study(s); } catch (e) { toastL('⚠️ ' + errMsg(e), 5000); } };
      // details: hover (mouse), focus (keyboard), press-and-hold (touch screens) — a click / tap only chooses the subject
      let tipTimer = null, tipFor = null;
      const hideTip = () => { clearTimeout(tipTimer); tipCard.classList.remove('on', 'sheet'); tipFor = null; };
      const showTip = (s, card, { sheet = false } = {}) => {
        tipCard.innerHTML = ''; tipCard.append(infoCard(s, s.meta));
        if (window.NoemaMT) {   // 🌐 its title and description in the UI language, on request (docs/i18n.md §11)
          const ns = [tipCard.querySelector('.nx-infohead h3'), tipCard.querySelector('.nx-desc')].filter(Boolean).map(n => NoemaMT.mark(n, { language: s.language || s.meta?.language, kind: 'explore.pack' }));
          const tg = NoemaMT.toggle(acc, ns); if (tg) tipCard.querySelector('.nx-info').append(tg);
        }
        if (sheet) tipCard.append(el('div', { class: 'row nx-sheetfoot' }, el('button', { class: 'btn primary', onclick: () => pick(s) }, '📚 ' + tr('loader.explore.study')), el('button', { class: 'btn small', onclick: hideTip }, tr('loader.close'))));
        if (!tipCard.isConnected) document.body.append(tipCard);
        tipFor = s.id; tipCard.classList.toggle('sheet', sheet);
        if (sheet) {   // touch: a bottom sheet; tapping outside closes it
          tipCard.style.cssText = ''; tipCard.classList.add('on');
          setTimeout(() => document.addEventListener('pointerdown', function off(ev) { if (!tipCard.contains(ev.target)) { hideTip(); } if (!tipCard.classList.contains('sheet') || !tipCard.contains(ev.target)) document.removeEventListener('pointerdown', off, true); }, true), 0);
          return;
        }
        // fixed to the window, so it is never clipped by the dialog; below the card, or above it when there is no room
        const r = card.getBoundingClientRect(), w = Math.min(400, innerWidth - 16);
        tipCard.style.width = w + 'px'; tipCard.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px'; tipCard.style.top = '0px';
        const h = Math.min(tipCard.offsetHeight || 400, innerHeight - 16);
        tipCard.style.top = (r.bottom + 6 + h <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h)) + 'px'; tipCard.classList.add('on');
      };
      const draw = () => {
        grid.innerHTML = ''; const t = q.value.trim().toLowerCase();
        const items = all.filter(s => !t || (s.title + ' ' + (s.description || '') + ' ' + (s.owner_name || '')).toLowerCase().includes(t));
        if (!items.length) grid.append(el('p', { class: 'tiny' }, all.length ? tr('loader.explore.noMatch') : tr('loader.explore.none')));
        items.forEach((s, i) => {
          let held = false, pressT = null, startXY = null;
          const card = el('button', { class: 'nx-card', type: 'button', 'aria-label': tr('loader.explore.cardLabel', { title: s.title }), style: { animationDelay: i * 30 + 'ms' },
            onclick: e => { if (held) { e.preventDefault(); held = false; return; } pick(s); },
            onmouseenter: () => { if (touch) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(s, card), 180); },
            onmouseleave: e => { clearTimeout(tipTimer); if (!tipCard.contains(e.relatedTarget)) hideTip(); },
            onfocus: () => { if (!touch) showTip(s, card); }, onblur: () => { if (tipFor === s.id && !tipCard.classList.contains('sheet')) hideTip(); },
            onpointerdown: e => { if (e.pointerType === 'mouse') return; held = false; startXY = [e.clientX, e.clientY]; clearTimeout(pressT); pressT = setTimeout(() => { held = true; navigator.vibrate?.(15); showTip(s, card, { sheet: true }); }, 450); },
            onpointermove: e => { if (startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) clearTimeout(pressT); },
            onpointerup: () => clearTimeout(pressT), onpointercancel: () => clearTimeout(pressT),
            oncontextmenu: e => { if (touch || held) e.preventDefault(); } },
            el('span', { class: 'nx-emo' }, s.emoji || '📘'), window.NoemaMT ? NoemaMT.mark(el('b', {}, s.title), { language: s.language || s.meta?.language, kind: 'explore.pack' }) : el('b', {}, s.title), langTag(s));
          grid.append(card);
        });
      };
      box.classList.add('nx-explore');
      box.append(brandHead('🌍 ' + tr('loader.explore.title'), matchMedia('(hover: none)').matches ? tr('loader.explore.subTouch') : tr('loader.explore.subMouse')), q, window.NoemaMT?.bar(acc, grid) || null, grid,   // i18n-ignore (a media query)
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      draw(); setTimeout(() => q.focus(), 200);
      const iv = setInterval(() => { if (!box.isConnected) { tipCard.remove(); clearInterval(iv); } }, 300);
      tipCard.addEventListener('mouseleave', e => { if (!tipCard.classList.contains('sheet') && !e.relatedTarget?.closest?.('.nx-card')) hideTip(); });
    });
  }

  /* ---- 🔔 incoming shares: bell + banner (engine) and the picker ---- */
  /* ---- 🔔 a new version of a subject taken from 🌍 Explore waits for the learner: ⬆️ Update or Keep mine ---- */
  const SubjUpdates = {
    list: [],
    async check(acc) {
      const metas = ls.keys(`${P}${acc}:a:packmeta:`).map(k => jget(k, null)).filter(m => m?.id && m.publicFrom);
      if (!metas.length) return (this.list = []);
      const rows = await NoemaCloud.publicRows([...new Set(metas.map(m => m.publicId || m.id))]).catch(() => null); if (!rows) return this.list;
      const CU = window.NoemaCurriculum;
      this.list = metas.map(m => {
        const r = rows.find(x => x.owner === m.publicFrom && x.subject_id === (m.publicId || m.id)); if (!r) return null;
        const v = r.meta?.version || null, mark = v || r.updated_at;
        const newer = v ? v !== (m.version || null) : !!(m.publicAt && r.updated_at > m.publicAt);
        if (!newer || m.publicSkip === mark) return null;
        const steps = CU?.stepsOf ? CU.stepsOf(acc, m.id).filter(x => x.c.nodes[x.nid].pack?.assigned).length : 0;
        return { id: 'subup:' + m.id, kind: 'subjupdate', subject: m.id, title: m.title, from_name: r.owner_name || m.publicOwner || '', owner: r.owner, publicId: r.subject_id, mark, at: r.updated_at, steps };
      }).filter(Boolean);
      return this.list;
    },
    /** ⬆️ Take the new version: the same subject id, so progress, notes and conversations stay; steps it teaches are re-planned. */
    async apply(acc, u) {
      const r = await fetch(NoemaCloud.publicPackUrl(u.owner, u.publicId)); if (!r.ok) throw new Error(tr('loader.explore.downloadFailed', { status: r.status }));
      const p = await r.json(); p.subject.id = u.subject;
      const s = await importPack(acc, p, { publicFrom: u.owner, publicOwner: u.from_name || '', publicId: u.publicId, publicAt: u.at });
      await attachSharedFiles(acc, p, 'noema-public');
      this.list = this.list.filter(x => x.id !== u.id); return s;
    },
    keep(acc, u) { const k = KV.accountKey('packmeta:' + u.subject, acc), m = jget(k, null); if (m) KV.set(k, JSON.stringify({ ...m, publicSkip: u.mark })); this.list = this.list.filter(x => x.id !== u.id); },
  };
  const Notes = {
    pending: [], remote: [], listeners: [], timer: null, acc: null,
    on(f) { this.listeners.push(f); f(this.pending); },
    /** An answered share or invitation leaves the list and the cloud's cached copy (else local() would bring it back). */
    drop(id) { this.remote = this.remote.filter(x => x.id !== id); this.pending = this.pending.filter(x => x.id !== id); this.emit(); },
    emit() { this.listeners.forEach(f => { try { f(this.pending); } catch (e) { NoemaCore.errors.report(e, { where: 'loader.notes.listener', severity: 'error' }); } }); },
    /** 🔔 = shares and invitations (from the cloud) + updates that wait for the learner (shared curricula, their steps, Explore subjects). */
    local() { this.pending = [...this.remote, ...(window.NoemaCurShare?.updates?.(this.acc) || []), ...SubjUpdates.list, ...Notices.list(this.acc)]; this.emit(); return this.pending; },
    async refresh() {
      if (!this.acc || !isCloudAcc(this.acc)) return this.pending;
      try {
        const subs = (await NoemaCloud.incomingShares()) || [];
        // 👥 invitations to curricula (engine/curshare.js) — in the same bell and banner
        const curs = window.NoemaCurShare ? ((await NoemaCurShare.invites().catch(e => { console.warn('[notes] curricula', e.message); return []; })) || []).map(i => ({ ...i, id: 'cur:' + i.curriculum, kind: 'curriculum', from_name: i.owner_name || '', meta: { ...(i.meta || {}), counts: i.meta?.counts || {} } })) : [];
        await SubjUpdates.check(this.acc).catch(e => console.warn('[notes] updates', e.message));
        this.remote = [...subs, ...curs]; this.local();
      } catch (e) { console.warn('[notes]', e.message); }
      return this.pending;
    },
    start(acc) {
      this.acc = acc; this.local(); if (!isCloudAcc(acc)) return;   // 🔔 news kept on this device shows at once, for every kind of account
      this.refresh(); clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), 120e3);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refresh(); });
      if (!this.curOn && window.NoemaCurShare?.onChange) { this.curOn = true; NoemaCurShare.onChange(() => this.local()); }
    },
    /** An update: take it (true) or keep mine (false). A shared map's changes open their review (you tick what you take). */
    async update(sh, take) {
      const acc = this.acc, done = () => { this.local(); };
      if (sh.kind === 'curupdate') { if (take) { await window.NoemaCurMap?.reviewChanges(acc, sh.curriculum, { onDone: done }); return; } await NoemaCurShare.takeChanges(acc, sh.curriculum, []); return done(); }
      if (sh.kind === 'stepupdate') { if (take) await NoemaCurShare.download(acc, sh.curriculum, sh.node); else NoemaCurShare.keepStep(acc, sh.curriculum, sh.node); return done(); }
      if (sh.kind === 'subjupdate') { if (take) await SubjUpdates.apply(acc, sh); else SubjUpdates.keep(acc, sh); return done(); }
    },
    async accept(sh) {
      if (sh.kind === 'curriculum') {   // 👥 join a shared curriculum: my own progress, the steps prepared together
        const c = await NoemaCurShare.join(this.acc, sh.curriculum);
        this.drop(sh.id);
        return { kind: 'curriculum', curriculum: c.id, title: c.title || c.goal };
      }
      const p = await NoemaCloud.downloadShared(sh.id);
      if ((REG.subjects || []).some(x => x.id === p.subject.id)) p.subject.id = p.subject.id + '-' + slugify(sh.from_name || 'shared');
      const added = await importPack(this.acc, p, { sharedBy: sh.from_name || sh.from_email, sharedAt: new Date().toISOString() });
      await attachSharedFiles(this.acc, p, 'noema-shared');
      await NoemaCloud.answerShare(sh.id, true);
      this.drop(sh.id);
      return added;
    },
    async reject(sh) { if (sh.kind === 'curriculum') await NoemaCurShare.decline(sh.curriculum); else await NoemaCloud.answerShare(sh.id, false); this.drop(sh.id); },
  };
  /** One request as a row: who, what (info), Accept / Reject. */
  function shareRow(sh, { onAccepted } = {}) {
    if (UPDATE_KINDS.includes(sh.kind)) return updateRow(sh);
    if (sh.kind === 'notice') return noticeRow(sh);
    const tB = el('b', {}, sh.title), mtT = window.NoemaMT ? NoemaMT.toggle(Notes.acc, [NoemaMT.mark(tB, { language: sh.language || sh.meta?.language, kind: sh.kind === 'curriculum' ? 'shared.roadmap' : 'shared.pack' })]) : null;   // 🌐 its title on request (the personal message is never sent)
    const row = el('div', { class: 'nx-req' },
      sh.kind === 'curriculum' ? el('div', { class: 'grow' }, ...trx('loader.req.invites', { who: el('b', {}, `${sh.from_name || tr('loader.req.someone')}`), title: tB }), mtT ? ' ' : null, mtT,
        el('div', { class: 'tiny' }, '👥 ' + tr('loader.req.invitesSub', { n: num(sh.meta?.counts?.steps) }) + (sh.message ? ' · ' + tr('loader.quoted', { text: sh.message }) : '')))
      : el('div', { class: 'grow' }, ...trx('loader.req.wantsShare', { who: el('b', {}, `${sh.from_name || sh.from_email}`), title: tB }), mtT ? ' ' : null, mtT,
        el('div', { class: 'tiny' }, tr('loader.req.counts', { chapters: num(sh.meta?.counts?.chapters), exercises: num(sh.meta?.counts?.exercises) }) + (sh.message ? ' · ' + tr('loader.quoted', { text: sh.message }) : ''))),
      sh.kind === 'curriculum' ? null : el('button', { class: 'btn small ghost', title: tr('loader.req.details'), onclick: () => overlay((b, c) => b.append(infoCard({ title: sh.title, emoji: sh.meta?.emoji, owner_name: sh.from_name }, sh.meta), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: c }, tr('loader.req.back'))))) }, 'ℹ️'),
      el('button', { class: 'btn small primary', onclick: async e => { e.currentTarget.disabled = true; try { const s = await Notes.accept(sh); toastL(s.kind === 'curriculum' ? '👥 ' + tr('loader.req.joined', { title: s.title }) : '✅ ' + tr('loader.req.accepted', { title: s.title })); onAccepted && onAccepted(s); } catch (er) { toastL('⚠️ ' + errMsg(er), 5000); e.target.disabled = false; } } }, '✓ ' + (sh.kind === 'curriculum' ? tr('loader.req.join') : tr('loader.req.accept'))),
      el('button', { class: 'btn small', onclick: async () => { await Notes.reject(sh).catch(er => toastL('⚠️ ' + errMsg(er))); toastL(tr('loader.req.rejected')); } }, '✕ ' + tr('loader.req.reject')));
    return row;
  }

  /** 🔔 A piece of news as a row: what arrived, when, and ✕ to clear it. */
  function noticeRow(sh) {
    const when = window.NoemaI18n ? NoemaI18n.fmt.ago(sh.at) : '';
    return el('div', { class: 'nx-req nx-notice' }, el('div', { class: 'grow' }, sh.text, when ? el('div', { class: 'tiny' }, when) : null),
      el('button', { class: 'btn small ghost', title: tr('loader.note.dismiss'), 'aria-label': tr('loader.note.dismiss'), onclick: () => Notices.dismiss(Notes.acc, sh.id) }, '✕'));
  }
  /** 🔔 “Clear all” under the bell's list, when news waits there (null otherwise). */
  function noticesClear(list) {
    if (!list.some(x => x.kind === 'notice')) return null;
    return el('div', { class: 'row nx-noticeclear', style: { justifyContent: 'flex-end' } }, el('button', { class: 'btn small ghost', onclick: () => Notices.clear(Notes.acc) }, tr('loader.note.clearAll')));
  }
  /** 🔔 An update as a row: what changed, and Take / Keep mine (it waits until the learner answers). */
  function updateText(sh) {
    if (sh.kind === 'curupdate') return ['🧭 ', ...trx('loader.upd.curChanged', { title: el('b', {}, sh.title) }, { who: sh.from_name || tr('loader.upd.owner') }), el('div', { class: 'tiny' }, sh.lines?.length ? tr('loader.upd.curChangesList', { n: num(sh.count), lines: sh.lines.join(' · ') }) : tr('loader.upd.curChanges', { n: num(sh.count) }))];
    if (sh.kind === 'stepupdate') return ['⚡ ', ...trx('loader.upd.stepNew', { title: el('b', {}, sh.title) }, { who: sh.from_name || tr('loader.upd.author') }), el('div', { class: 'tiny' }, tr('loader.upd.stepNewSub', { roadmap: sh.curTitle }))];
    return ['🌍 ', ...trx('loader.upd.subjNew', { title: el('b', {}, sh.title) }, { who: sh.from_name || tr('loader.upd.author') }), el('div', { class: 'tiny' }, tr('loader.upd.subjNewSub') + (sh.steps ? ' · ' + tr('loader.upd.subjSteps', { n: sh.steps }) : ''))];
  }
  const updateLabel = sh => sh.kind === 'curupdate' ? '🔎 ' + tr('loader.upd.review') : sh.kind === 'stepupdate' ? '⬇️ ' + tr('loader.upd.getIt') : '⬆️ ' + tr('loader.upd.update');
  function updateRow(sh) {
    const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await Notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toastL(take ? '✅ ' + tr('loader.pack.upToDate', { title: sh.title }) : '👍 ' + tr('loader.upd.kept', { title: sh.title })); else b.disabled = false; } catch (er) { toastL('⚠️ ' + errMsg(er), 5000); b.disabled = false; } };   // 🔎 Review only opens the review: “Not now” there keeps the update waiting
    return el('div', { class: 'nx-req nx-update' }, el('div', { class: 'grow' }, ...updateText(sh)),
      el('button', { class: 'btn small primary', onclick: act(true) }, updateLabel(sh)), el('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? tr('loader.upd.keepCopy') : tr('loader.upd.keepMine')));
  }

  Object.assign(APP, { Notes, explore, fmtWhen, importPack, isCloudAcc, shareDialog, shareRow });

  N.notices.onChange(() => Notes.local());   // 🔔 news kept on this device joins the bell's list
  Object.assign(N, {
    importPack, explore() { return explore(N.account.id); }, publicSubjects() { return publicSubjects(N.account.id); }, share(s) { return shareDialog(N.account.id, s); },
    notes: Notes, shareRow, noticesClear, updateText, updateLabel, infoCard, packInfo,
  });
  const started = N.boot.started;
  N.boot.started = acc => { started?.(acc); Notes.start(acc.id); };
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const TH = () => window.NoemaThemes;
  const N = () => window.Noema;
  const CU = () => window.NoemaCurriculum;
  const CM = () => window.NoemaCurMap;
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const settings = () => N().jget(`noema1:${acc()}:a:settings`, {}) || {};
  const uiPref = () => settings().lang;
  const lang = () => window.NoemaI18n ? NoemaI18n.lang(uiPref()) : 'en';
  const caught = (where, severity = 'warning') => NoemaCore.errors.catcher(where, { severity });
  const toast = (m, ms) => N().toast(m, ms);
  const jget = (k, d) => N().jget(k, d);
  const jset = (k, v) => N().jset(k, v);
  const stateOf = sid => NoemaCore.learning.progressOf(acc(), sid);   // the learning log's fold (read only)
  const subjects = force => APP.subjects(force);
  const h = S.h;
  const svg = S.svg;
  const faceEl = S.faceEl;
  const tone = S.tone;
  const ico = S.ico;
  const icoTxt = S.icoTxt;
  const pill = S.pill;
  const chev = S.chev;
  const L = S.L;
  const rich = S.rich;
  const fmtDate = S.fmtDate;
  const sheet = S.sheet;
  const modal = S.modal;
  const menuButton = S.menuButton;
  const popMenu = S.popMenu;
  const fitRow = S.fitRow;
  const tipped = S.tipped;
  const go = S.go;
  const open = S.open;
  const chrome = S.chrome;
  const page = S.page;
  const isLang = S.isLang;
  const WORLDS = S.WORLDS;
  const importFile = (...a) => APP.importFile(...a);
  const landedOpen = (...a) => APP.landedOpen(...a);
  const onStudy = (...a) => APP.onStudy(...a);
  const subjectPct = (...a) => APP.subjectPct(...a);
  /* ---------- 🔎 the search page (#/search?q=…): engine/search.js draws it ---------- */
  PAGES.search = () => {
    if (!window.NoemaSearch) { page({ tab: null, crumbs: [[L('sr_search')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaSearch.page({ page, h, L, go, open, sheet, menuButton, faceEl, pill, svg, ico, chev, main: S.main });
  };

  /* ---------- 🗄️ the vault (#/vault?…): engine/vault.js draws it ---------- */
  PAGES.vault = () => {
    if (!window.NoemaVault) { page({ tab: 'vault', crumbs: [[L('vault')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaVault.page({ page, h, L, go, open, sheet, modal, menuButton, popMenu, faceEl, pill, svg, ico, chev });
  };

  /* ---------- 👥 people (#/people, #/chat/<room>, #/group/<room>, #/join/<code>): engine/social.js draws them ---------- */
  const socialCtx = () => ({ page, h, L, go, open, sheet, modal, chrome, menuButton, popMenu, faceEl, pill, svg, ico, icoTxt, chev, fitRow });
  for (const k of ['people', 'chat', 'group', 'join']) PAGES[k] = args => {
    if (!window.NoemaSocial) { page({ tab: 'people', crumbs: [[L('people')]] }, h('p', { class: 'ns-muted' }, '…')); return; }
    NoemaSocial.page(k, args || [], socialCtx());
  };

  /* ======================= pages ======================= */
  /* ---------- Explore: what others share (Roadmaps, or subjects), in one closed section per domain; searching shows only the matches ---------- */
  PAGES.explore = async ([kind] = []) => {
    const rm = kind !== 'subjects', title = L(rm ? 'exploreRoadmaps' : 'exploreShared');
    const v = page({ tab: 'discover', crumbs: [[L('discover'), '#/discover'], [title]], back: '#/discover', corner: true },
      h('div', {}, h('h1', {}, title), h('p', { class: 'ns-muted' }, L(rm ? 'exploreRoadmapsLead' : 'exploreLead'))));
    const q = h('input', { class: 'noema-input ns-search', type: 'search', placeholder: L(rm ? 'searchRoadmaps' : 'searchSubjects'), 'aria-label': L(rm ? 'searchRoadmaps' : 'searchSubjects') });
    const body = h('div', { class: 'ns-exp' }, h('p', { class: 'ns-muted' }, L('loading')));
    v.append(q, body);
    let items = [], studyIt = null;
    try {
      if (rm) items = await CM().publicRoadmaps(acc());
      else { const r = await N().publicSubjects(); items = r.all; studyIt = r.study; }
    } catch (e) { body.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, L('exploreOffline')), h('p', { class: 'ns-muted' }, e.message))); q.hidden = true; return; }
    const busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (er) { toast(er.message, 5000); } b.disabled = false; };
    const mtK = rm ? 'explore.roadmap' : 'explore.pack';   // 🌐 shared texts, translatable on request (engine/mt.js, docs/i18n.md §11)
    const mtN = (n, x) => window.NoemaMT ? NoemaMT.mark(n, { language: x.language || x.meta?.language, kind: mtK }) : n;
    // the person who shares it: a quiet button to their page (#/u/<id>), next to the row
    const who = (row, x) => x.owner ? h('div', { class: 'ns-itemwrap noema-chipwrap' }, row, h('span', { class: 'ns-menu' }, tipped(h('button', { class: 'ns-iconbtn ns-who', 'aria-label': L('pfOpen', { who: x.owner_name || '…' }), onclick: () => go('#/u/' + encodeURIComponent(x.owner)) }, svg('user')), L('pfOpen', { who: x.owner_name || '…' })))) : row;
    const mk = (x, i) => who(rm
      ? h('button', { class: 'ns-item ns-pubitem', 'data-id': x.id, onclick: e => busy(e.currentTarget, () => CM().openPublic(acc(), x, { onOpen: id => go('#/map/' + encodeURIComponent(id)) })) },
        ico('map', (i % 4) + 1), h('span', { class: 't' }, mtN(h('b', {}, x.title), x), h('small', {}, x.description ? mtN(h('span', {}, x.description), x) : null, x.description ? ' · ' : null, L('rmPubMeta', { who: x.owner_name || '…', n: x.steps, p: x.prepared }))),
        h('span', { class: 'ns-pill' }, L(x.have ? (x.own ? 'rmYours' : 'rmJoined') : 'rmJoin')))
      : h('button', { class: 'ns-item ns-pubitem', 'data-id': x.id, onclick: e => busy(e.currentTarget, () => studyIt(x, s => open(s.id))) },
        icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, mtN(h('b', {}, x.title), x), N().langTag?.(x) || '', x.description ? mtN(h('small', {}, x.description), x) : null), chev()), x);
    if (!items.length) { q.hidden = true; body.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L(rm ? 'noPublicRoadmaps' : 'noPublicSubjects')))); return; }
    const DOMS = CU()?.DOMAINS || ['other'];
    const sections = h('div', { class: 'ns-doms' }, ...DOMS.map(d => [d, items.filter(x => (x.domain || 'other') === d)]).filter(([, l]) => l.length).map(([d, l]) =>
      h('details', { class: 'ns-dom', 'data-dom': d }, h('summary', {}, h('span', { class: 'ns-domt' }, L('dom_' + d)), h('span', { class: 'ns-pill' }, String(l.length)), h('span', { class: 'ns-domchev', 'aria-hidden': 'true' }, '›')),
        h('div', { class: 'ns-list' }, ...l.map(mk)))));
    const results = h('div', { class: 'ns-list ns-results', hidden: true });
    body.replaceChildren(...[window.NoemaMT?.bar(acc(), body)].filter(Boolean), sections, results);
    // searching (the field has the focus, or something is typed): only the matches, or nothing; the sections come back when the field is left empty
    let focused = false;
    const show = () => { const t = q.value.trim(); sections.hidden = focused || !!t; results.hidden = !t; };
    q.addEventListener('input', () => {
      const t = q.value.trim().toLowerCase(), hit = items.filter(x => [x.title, x.description, x.owner_name].join(' ').toLowerCase().includes(t));
      results.replaceChildren(...(hit.length ? hit.map(mk) : [h('div', { class: 'ns-item ns-muted ns-noresults' }, L('noResults'))])); show();
    });
    q.addEventListener('focus', () => { focused = true; show(); }); q.addEventListener('blur', () => { focused = false; show(); });
  };

  /* ---------- Discover: everything that adds something new ---------- */
  PAGES.discover = () => {
    const w = TH()?.world() || 'know', item = (ic, n, title, sub, run, cls = '') => h('button', { class: 'ns-item ' + cls, onclick: run }, typeof ic === 'string' ? ico(ic, n) : ic, h('span', { class: 't' }, h('b', {}, title), h('small', {}, sub)), chev());
    page({ tab: 'discover', crumbs: [[L('discover')]], corner: true },
      h('h1', {}, L('discover')),
      h('div', { class: 'ns-list' },
        item('search', 4, L('exploreShared'), w === 'lang' ? L('exploreLangSub') : L('exploreSub'), () => go('#/explore/subjects'), 'ns-explore'),
        w !== 'lang' ? item('people', 2, L('exploreRoadmaps'), L('exploreRoadmapsSub'), () => go('#/explore'), 'ns-explorerm') : null,
        w !== 'lang' && CM()?.fromSources ? item('upload', 3, L('fromSources'), L('fromSourcesSub'), () => CM().fromSources(acc(), { onStudy }), 'ns-fromsrc') : null,
        w !== 'lang' ? item('map', 1, L('newRoadmap'), L('newRoadmapSub'), () => CM()?.create(acc(), { onStudy }), 'ns-create') : null,
        w !== 'lang' ? item('spark', 2, L('createClaude'), L('createClaudeSub'), () => N().claudeGuide({ onDone: s => landedOpen(s) })) : null,
        w !== 'know' && WORLDS.lang?.create ? item(icoTxt('文A', 3), 3, L('newLanguage'), L('newLanguageSub'), () => WORLDS.lang.create()) : null,
        item('upload', 1, L('importFile'), L('importFileSub'), importFile),
        w !== 'lang' ? item('download', 4, L('importMap'), L('importMapSub'), () => CM()?.importMap(acc(), { onStudy })) : null),
      h('span', { class: 'ns-label' }, L('withClaude')),
      h('div', { class: 'ns-list' },
        item('chat', 4, L('claudeApp'), L('claudeAppSub'), () => N().claudeSetupView?.(acc(), { open: 'B' })),
        item('key', 2, L('claudeKey'), L('claudeKeySub'), () => go('#/me/ai'))));
  };

  /* ---------- 🛠️ admin pages (#/admin/reports[/<id>]): engine/report.js draws them ---------- */
  PAGES.admin = ([what, ...rest]) => {
    if (what !== 'reports' || !window.NoemaReport) { location.replace('#/'); return; }
    NoemaReport.page(rest, { page, h, L, go, pill, svg, chev, sheet, modal, menuButton });
  };

  /* ---------- the page others see: Me (#/profile, yours) and #/u/<id> (somebody's, once published). docs/PROFILE.md ---------- */
  const PAGE_PARTS = [['progress', 'pfProgress', 'pfProgressSub'], ['achievements', 'pfAch', 'pfAchSub'], ['languages', 'pfLangs', 'pfLangsSub'], ['topics', 'pfTopics', 'pfTopicsSub'], ['shares', 'pfShares', 'pfSharesSub']];
  const myPageKey = () => `noema1:${acc()}:a:mypage`;
  /** your page as kept on this device: { bio, avatar, show: { progress… }, published } — everything off until you switch it on */
  const myPage = () => ({ bio: '', avatar: null, show: {}, published: false, ...(jget(myPageKey(), null) || {}) });
  function putMyPage(p) { const v = JSON.stringify(p); if (N()?.kv?.set) N().kv.set(myPageKey(), v); else jset(myPageKey(), p); }
  const cloudMe = () => N()?.account?.kind === 'cloud' && window.NoemaCloud?.session?.()?.user?.id ? NoemaCloud.session().user.id : null;
  const avatarEl = (a, src, cls = '') => src ? h('img', { class: 'ns-avatar ' + cls, src, alt: '' }) : h('span', { class: 'ns-me ns-avatar ' + cls, 'data-emoji': '1' }, a.emoji || (a.display_name || a.name || '?').trim()[0]?.toUpperCase() || '?');
  /** What the page shows of you now, only the parts switched on (progress, treasures, languages, topics) */
  async function myCard(show) {
    const card = {}, st = N().stats?.get() || { xp: 0 }, sn = N().stats?.streakNow() || 0, subs = await subjects();
    let done = 0, fcN = 0, boss = 0; for (const s of subs) { const x = stateOf(s.id); if (!x) continue; done += chaptersDone(s, x); fcN += Object.keys(x.fc || {}).length; boss += Object.keys(x.boss || {}).length; }
    if (show.progress) card.progress = { level: LEVEL(st.xp || 0).lv, xp: st.xp || 0, streak: sn, chapters: done };
    if (show.achievements) card.achievements = medals({ fcN, sn, boss, xp: st.xp || 0 }).filter(m => m[0]).map(m => m[1]);
    if (show.languages) card.languages = WORLDS.lang?.studying ? WORLDS.lang.studying() : subs.filter(isLang).map(s => ({ id: s.id, title: s.title, languages: [] }));
    if (show.topics) card.topics = [...(CU()?.list(acc()) || []).filter(c => c.nodes && Object.keys(c.nodes).length).map(c => ({ kind: 'roadmap', title: c.title || c.goal, pct: Math.round(CU().summary(acc(), c).pct * 100) })),
      ...subs.filter(s => !isLang(s) && !CU()?.stepsOf?.(acc(), s.id)?.length && subjectPct(s) > 0).map(s => ({ kind: 'subject', title: s.title, emoji: s.emoji || null, pct: Math.round(subjectPct(s) * 100) }))].slice(0, 40);
    return card;
  }
  /** Send your page to the cloud (published or not: unpublished, only you can read it) */
  async function saveMyPage(p) {
    putMyPage(p);
    if (!cloudMe()) return;
    const a = N().account || {};
    await NoemaCloud.saveMyPage({ published: p.published, display_name: a.name, emoji: a.emoji, bio: p.bio, avatar: p.avatar, show: p.show, card: await myCard(p.show) });
  }
  PAGES.profile = async () => {
    const a = N().account || {}, uid = cloudMe(), v = page({ tab: 'me', crumbs: [[L('me')]], corner: true });
    let p = myPage();
    if (uid && !jget(myPageKey(), null)) { const r = await NoemaCloud.myPage().catch(() => null); if (r) { p = { bio: r.bio || '', avatar: r.avatar || null, show: r.show || {}, published: !!r.published }; putMyPage(p); } }   // another device wrote it
    const draw = async () => {
      const status = h('p', { class: 'ns-pfstate tiny' }, svg(p.published ? 'globe' : 'lock'), ' ', L(p.published ? 'pfPublic' : 'pfPrivate'));
      const acts = fitRow(
        tipped(h('button', { class: 'btn small', 'data-act': 'edit', onclick: editPage }, svg('edit'), L('pfEdit')), L('pfEditTip')),
        uid ? tipped(h('button', { class: 'btn small' + (p.published ? '' : ' primary'), 'data-act': 'publish', onclick: async e => { e.currentTarget.disabled = true; p.published = !p.published; try { await saveMyPage(p); toast(L(p.published ? 'pfPublic' : 'pfPrivate'), 2500); } catch (er) { p.published = !p.published; toast(L('pfCloudErr', { e: er.message }), 5000); } draw(); } }, svg(p.published ? 'lock' : 'globe'), L(p.published ? 'pfUnpublish' : 'pfPublish')), L('pfPublishTip')) : null,
        uid && p.published ? tipped(h('button', { class: 'btn small', 'data-act': 'link', onclick: () => { const url = location.href.split('#')[0].split('?')[0] + '#/u/' + uid; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast(L('pfLinkCopied'), 2500), () => prompt(L('pfLink'), url)); } }, svg('link'), L('pfLink')), L('pfLinkTip')) : null);
      const card = await myCard(p.show);
      v.replaceChildren(...pageView({ display_name: a.name, emoji: a.emoji, bio: p.bio, avatar: p.avatar, show: p.show, card }, { owner: uid, mine: true }), h('div', { class: 'ns-pffoot' }, status, uid ? null : h('p', { class: 'tiny ns-muted' }, L('pfNeedCloud')), acts));
      if (uid && p.published) saveMyPage(p).catch(caught('shell.mypage.publish'));   // a published page follows your progress
    };
    function editPage() {
      sheet(L('pfEdit'), (body, close) => {
        const pic = h('div', { class: 'ns-pfpic' }, avatarEl(a, p.avatar, 'big'));
        const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { p.avatar = await smallPicture(f); pic.replaceChildren(avatarEl(a, p.avatar, 'big')); delBtn.style.display = ''; } catch (er) { toast(L('pfPhotoBad'), 4000); } } });
        const delBtn = h('button', { class: 'btn small ghost', style: { display: p.avatar ? '' : 'none' }, onclick: () => { p.avatar = null; pic.replaceChildren(avatarEl(a, null, 'big')); delBtn.style.display = 'none'; } }, L('pfPhotoDel'));
        const bio = h('textarea', { class: 'noema-input ns-pfbio', maxlength: '600', rows: '4', placeholder: L('pfBioPh'), 'aria-label': L('pfBio') }); bio.value = p.bio || '';
        const sw = PAGE_PARTS.map(([k, t, sub]) => { const inp = h('input', { type: 'checkbox', 'data-part': k, checked: !!p.show[k] || null }); return h('label', { class: 'ns-pfsw' }, h('span', { class: 'grow' }, h('b', {}, L(t)), h('small', {}, L(sub))), h('span', { class: 'switch' }, inp, h('i'))); });
        body.append(h('div', { class: 'ns-pfedit' }, h('div', { class: 'row nowrap' }, pic, h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => file.click() }, svg('upload'), L(p.avatar ? 'pfPhoto' : 'pfPhotoAdd')), delBtn), file),
          h('span', { class: 'ns-label' }, L('pfBio')), bio, h('span', { class: 'ns-label' }, L('pfShow')), h('p', { class: 'tiny' }, L('pfShowSub')), h('div', { class: 'ns-list ns-pfsws' }, ...sw),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-act': 'save', onclick: async e => {
            e.currentTarget.disabled = true; p.bio = bio.value.trim().slice(0, 600); p.show = Object.fromEntries(sw.map(l => { const i = l.querySelector('input'); return [i.dataset.part, i.checked]; }));
            try { await saveMyPage(p); toast(L('pfSaved'), 2000); } catch (er) { toast(L('pfCloudErr', { e: er.message }), 5000); }
            close(); draw(); } }, L('pfDone')))));
      }, { cls: 'ns-pfsheet' });
    }
    draw();
  };
  PAGES.u = async ([id]) => {
    if (id && id === cloudMe()) return location.replace('#/profile');
    const v = page({ tab: null, crumbs: [[L('me')]], back: '#/discover' }, h('p', { class: 'ns-muted' }, L('loading')));
    let r = null; try { r = id && window.NoemaCloud ? await NoemaCloud.publicPage(id) : null; } catch (e) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, h('p', {}, L('pfCloudErr', { e: e.message })))); return; }
    if (!r || !r.published) { v.replaceChildren(h('div', { class: 'ns-panel ns-empty' }, faceEl(undefined, 'breathe'), h('p', {}, L('pfMissing')))); return; }
    chrome({ tab: null, crumbs: [[r.display_name || '…']], back: '#/discover' });
    v.replaceChildren(...pageView(r, { owner: id }), window.NoemaSocial?.personActions(socialCtx(), id), h('p', { class: 'tiny ns-muted' }, L('pfUpdated', { date: fmtDate(r.updated_at) })));
  };
  /** The page itself (yours as others see it, or somebody's): picture, name, a few words, then the parts that are shown */
  function pageView(r, { owner, mine = false }) {
    const show = r.show || {}, card = r.card || {}, part = (k, ...kids) => show[k] ? h('section', { class: 'ns-panel ns-pfpart', 'data-part': k }, h('span', { class: 'ns-label' }, L(PAGE_PARTS.find(x => x[0] === k)[1])), ...kids) : null;
    const none = () => h('p', { class: 'tiny ns-muted' }, L('pfNone')), pr = card.progress;
    const langName = c => { try { return new Intl.DisplayNames([lang()], { type: 'language' }).of(c) || c; } catch (e) { return c; } };
    const shares = show.shares && owner ? h('div', { class: 'ns-pfshares' }, h('p', { class: 'tiny ns-muted' }, L('loading'))) : null;
    if (shares) Promise.all([CM()?.publicRoadmaps ? CM().publicRoadmaps(acc()).catch(() => []) : [], N().publicSubjects ? N().publicSubjects().catch(() => ({ all: [] })) : { all: [] }]).then(([rms, ps]) => {
      const rl = rms.filter(x => x.owner === owner), sl = (ps.all || []).filter(x => x.kind === 'public' && x.owner === owner), busy = async (b, fn) => { b.disabled = true; try { await fn(); } catch (er) { toast(er.message, 5000); } b.disabled = false; };
      shares.replaceChildren(...(rl.length || sl.length ? [
        rl.length ? h('span', { class: 'tiny ns-muted' }, L('pfSharedRm')) : null, rl.length ? h('div', { class: 'ns-list' }, ...rl.map((x, i) => h('button', { class: 'ns-item', onclick: e => busy(e.currentTarget, () => CM().openPublic(acc(), x, { onOpen: cid => go('#/map/' + encodeURIComponent(cid)) })) }, ico('map', (i % 4) + 1), h('span', { class: 't' }, h('b', {}, x.title), x.description ? h('small', {}, x.description) : null), chev()))) : null,
        sl.length ? h('span', { class: 'tiny ns-muted' }, L('pfSharedSubj')) : null, sl.length ? h('div', { class: 'ns-list' }, ...sl.map((x, i) => h('button', { class: 'ns-item', onclick: e => busy(e.currentTarget, () => ps.study(x, s => open(s.id))) }, icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, h('b', {}, x.title), x.description ? h('small', {}, x.description) : null), chev()))) : null] : [none()]));
    });
    const MED = Object.fromEntries(medals({ fcN: 100, sn: 30, boss: 1, xp: 1000 }).map(m => [m[1], m]));
    return [h('div', { class: 'ns-hello ns-pfhead' }, avatarEl(r, r.avatar, 'big'), h('div', { class: 'grow' }, h('h1', {}, r.display_name || '…'), r.bio ? h('p', { class: 'ns-pfbiotext' }, r.bio) : mine ? h('p', { class: 'tiny ns-muted' }, L('pfBioPh')) : null)),
      part('progress', pr ? h('div', { class: 'ns-pfstats' }, pill(L('pfLevel', { lv: pr.level }), 1), pill(L('pfXp', { xp: pr.xp || 0 }), 2), pr.streak ? pill(L('streakDays', { n: pr.streak }).replace(/\.$/, ''), 3) : null, pill(L('nChapters', { n: pr.chapters || 0 }), 4)) : none()),
      part('achievements', (card.achievements || []).length ? medalsEl(card.achievements.filter(k => MED[k]).map(k => MED[k])) : none()),
      part('languages', (card.languages || []).length ? h('div', { class: 'ns-list' }, ...card.languages.map(x => h('div', { class: 'ns-item' }, icoTxt('文A', 4), h('span', { class: 't' }, h('b', {}, x.title), h('small', {}, [(x.languages || []).map(langName).join(' · '), x.words ? L('pfWords', { n: x.words }) : null].filter(Boolean).join(' · ')))))) : none()),
      part('topics', (card.topics || []).length ? h('div', { class: 'ns-list' }, ...card.topics.map((x, i) => h('div', { class: 'ns-item' }, x.kind === 'roadmap' ? ico('map', (i % 4) + 1) : icoTxt(x.emoji || (x.title || '?').slice(0, 1), (i % 4) + 1, x.emoji ? 'emo' : 'txt'), h('span', { class: 't' }, h('b', {}, x.title)), x.pct ? pill(x.pct + '%', 2) : null))) : none()),
      part('shares', shares)].filter(Boolean);
  }
  /** A picture for the page: square, 256 px, JPEG (small enough to live in the page's row; nothing of the original file travels) */
  async function smallPicture(f) {
    if (f.size > 15e6) throw new Error('too big');
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), m = Math.min(img.naturalWidth, img.naturalHeight);
      if (!m) throw new Error('empty');
      x.fillStyle = '#fff'; x.fillRect(0, 0, S, S); x.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
      for (const q of [0.85, 0.7, 0.55]) { const d = c.toDataURL('image/jpeg', q); if (d.length < 190000) return d; }
      throw new Error('too big');
    } finally { URL.revokeObjectURL(url); }
  }
  /** Buttons in one row when they all fit, else one under the other (never ragged) */
  const LEVEL = xp => NoemaCore.study.xp.level(xp);
  /** The treasures (medals): [[found, key, mark, words, tone]] — the Progress tab and the page others see (only the keys of the found ones travel) */
  function medals({ fcN = 0, sn = 0, boss = 0, xp = 0 } = {}) {
    const mastered = (CU()?.list(acc()) || []).reduce((a, c) => a + (c.status === 'ready' ? CU().summary(acc(), c).mastered : 0), 0);
    return [[mastered >= 1, 'step', '1', L('medalStep'), 1], [fcN >= 100, 'cards', '100', L('medalCards', { n: Math.min(fcN, 100) }), 4], [sn >= 7, 'week', '7', L('medalWeek', { n: Math.min(sn, 7) }), 2], [boss >= 1, 'boss', svg('crown'), L('medalBoss'), 3], [xp >= 1000, 'xp', '1k', L('medalXp'), 1], [sn >= 30, 'month', '30', L('medalMonth', { n: Math.min(sn, 30) }), 2]];
  }
  const medalsEl = MED => h('div', { class: 'ns-medals' }, ...MED.map(([ok, , x, l, n]) => h('div', { class: 'ns-medal' + (ok ? '' : ' lock') }, h('div', { class: 'm', style: ok ? tone(n) : null }, x), h('small', {}, l))));
  /** chapters of a subject with every section read (the study domain's count, NoemaCore.study.progress) */
  const chaptersDone = (s, x) => NoemaCore.study.progress.chaptersDone(s.chapters || s.meta?.chapters || [], x.read, x.boss);
  let later = new Set();
  const accepted = s => { if (s.kind === 'curriculum') go('#/map/' + encodeURIComponent(s.curriculum)); else open(s.id); };
  function drawShareBar(list) {
    const bar = S.share, items = list.filter(x => !later.has(x.id) && x.kind !== 'notice'); bar.replaceChildren();   // 🔔 news only waits in the bell
    bar.classList.toggle('on', !!items.length); if (!items.length) return;
    const sh = items[0], more = items.length > 1 ? h('span', { class: 'tiny' }, '  ' + L('moreInBell', { n: items.length - 1 })) : null;
    const laterBtn = h('button', { class: 'btn small ghost', title: L('decideLater'), onclick: () => { later.add(sh.id); drawShareBar(N().notes.pending); } }, L('later'));
    if (['curupdate', 'stepupdate', 'subjupdate'].includes(sh.kind)) {
      const act = take => async e => { const b = e.currentTarget; b.disabled = true; try { await N().notes.update(sh, take); if (sh.kind !== 'curupdate' || !take) toast(take ? L('upToDate', { title: sh.title }) : L('keepYours', { title: sh.title })); else b.disabled = false; } catch (er) { toast(er.message, 5000); b.disabled = false; } };
      bar.append(h('span', { class: 'grow' }, ...N().updateText(sh), more), h('button', { class: 'btn small primary', onclick: act(true) }, N().updateLabel(sh)), h('button', { class: 'btn small', onclick: act(false) }, sh.kind === 'curupdate' ? L('keepCopy') : L('keepMine')), laterBtn);
      return;
    }
    const cur = sh.kind === 'curriculum';
    const tB = h('b', {}, sh.title), mtT = window.NoemaMT ? NoemaMT.toggle(acc(), [NoemaMT.mark(tB, { language: sh.language || sh.meta?.language, kind: cur ? 'shared.roadmap' : 'shared.pack' })]) : null;   // 🌐 its title on request (the personal message is never sent)
    bar.append(h('span', { class: 'grow' }, svg(cur ? 'people' : 'bell'), ' ', ...rich(cur ? 'invitesYou' : 'wantsShare', { who: sh.from_name || sh.from_email || L('someone'), title: tB }), more, mtT ? ' ' : null, mtT),
      h('button', { class: 'btn small primary', onclick: async e => { e.target.disabled = true; try { const s = await N().notes.accept(sh); toast(L(cur ? 'joinedToast' : 'addedToast', { title: s.title })); APP.dropSubjects(); if (confirm(L('openNow', { title: s.title }))) accepted(s); } catch (er) { toast(er.message, 5000); e.target.disabled = false; } } }, cur ? L('join') : L('accept')),
      h('button', { class: 'btn small', onclick: async () => { await N().notes.reject(sh).catch(er => toast(er.message)); } }, L('reject')), laterBtn);
  }


  S.whenMounted(() => N().notes?.on(list => drawShareBar(list)));
  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
