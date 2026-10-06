/* ===================== Math typesetting (KaTeX) — only for subjects with features.math ===================== */
function typesetMath(root) {
  if (!SUBJ.features?.math || !window.renderMathInElement || !root) return;
  try {
    renderMathInElement(root, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'input'],
      ignoredClasses: ['pre', 'diagram', 'codelines', 'katex'], throwOnError: false,
    });
  } catch (e) { }
}
function watchMath() {
  if (!SUBJ.features?.math || !window.renderMathInElement) return;
  let pend = new Set(), t = null;
  new MutationObserver(ms => {
    ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.closest?.('.katex')) pend.add(n); }));
    clearTimeout(t); t = setTimeout(() => { const nodes = [...pend]; pend = new Set(); nodes.forEach(n => n.isConnected && typesetMath(n)); }, 30);
  }).observe(document.body, { childList: true, subtree: true });
  typesetMath(document.body);
}
