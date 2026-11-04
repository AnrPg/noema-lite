/* ===================== Boot (runs after every module is loaded; the loader has set Noema.subject / COURSE) ===================== */
dropUnrunnable();   // exercises this app cannot run (a newer type, an activity whose runtime is off) leave the indexes (32_activities.js)
checkRequires();
applySourceFilter();
boot();
wireSyncDot();
watchMath();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && DECK.open) toggleSourcesDeck(false); });
if (activeSrcSet()) $('.srcbtn')?.classList.add('on');
