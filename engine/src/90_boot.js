/* ===================== Boot (runs after every module is loaded; the loader has set Noema.subject / COURSE) ===================== */
applySourceFilter();
boot();
wireSyncDot();
watchMath();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && DECK.open) toggleSourcesDeck(false); });
if (activeSrcSet()) $('.srcbtn')?.classList.add('on');
