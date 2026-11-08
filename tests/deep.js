/* The Roadmap screens are Lit elements: their parts live in shadow roots, which Playwright's CSS selectors pierce but
   document.querySelector and innerText do not. deepText reads what a learner sees through the shadow roots. */

/** the visible text of the first element matching sel (searched through shadow roots): its shadow and slotted text once,
    nothing that is not shown (a closed details, an unopened tip, display: none), spaces folded */
const deepText = (page, sel) => page.evaluate(sel => {
  const shown = e => e.checkVisibility() || getComputedStyle(e).display === 'contents';
  const walk = n => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType === 11) return [...n.childNodes].map(walk).join(' ');
    if (n.nodeType !== 1 || n.nodeName === 'STYLE' || n.nodeName === 'SCRIPT' || !shown(n)) return '';
    if (n.nodeName === 'DETAILS' && !n.open) return n.querySelector(':scope > summary') ? walk(n.querySelector(':scope > summary')) : '';
    return [...(n.shadowRoot ? [n.shadowRoot] : []), ...n.childNodes].map(walk).join(' ');
  };
  const find = r => r.querySelector(sel) || [...r.querySelectorAll('*')].map(e => e.shadowRoot && find(e.shadowRoot)).find(Boolean) || null;
  const el = find(document);
  return el ? walk(el).replace(/\s+/g, ' ').trim() : '';
}, sel);

module.exports = { deepText };
