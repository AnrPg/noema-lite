/**
 * The author's page and its forms (noema-author, noema-schema-form), drawn in the page's DOM: one stylesheet of the document
 * on the design tokens (engine/tokens.css), pale and quiet, light and dark from the tokens themselves; the kit's aliases
 * (--u-*: src/ui/core/styles.ts) are set on the page's root. From 320 px wide without sideways scrolling: stacked below
 * 960 px, side by side above; logical properties for right to left; every target at least 24 × 24 px.
 */
export const authorStyles = `
.aa{
  --u-bg:var(--bg,#fbf9f4); --u-bg2:var(--bg2,#f3f0e8); --u-paper:var(--paper,var(--card,#fff)); --u-ink:var(--ink,#1f2330);
  --u-ink2:var(--ink2,#5b6172); --u-ink3:var(--ink3,#686d7c); --u-line:var(--line,#ebe7dd); --u-acc:var(--acc,var(--c-fill,#7c5cff));
  --u-acc-soft:var(--acc-soft,var(--c-bg,#efebff)); --u-acc-text:var(--acc-text,var(--c-ink,#6a4ae6));
  --u-ok-ink:var(--t1i,#0b6b50); --u-bad:var(--t3,var(--bad-bg,#fde8e8)); --u-bad-ink:var(--t3i,#a3262a);
  --u-br:var(--br,var(--r-sm,12px)); --u-ir:var(--ir,10px); --u-mono:var(--mono,ui-monospace,monospace);
  --u-fast:calc(var(--motion-fast,.15s) * var(--u-motion,1));
  color:var(--u-ink); font-family:var(--font,system-ui,sans-serif); max-width:1480px; margin:0 auto; padding:12px 16px 48px;
  box-sizing:border-box; min-width:0;
}
.aa *, .aa *::before, .aa *::after{ box-sizing:border-box; }
.aa :focus-visible{ outline:2px solid var(--u-acc-text); outline-offset:2px; }
.aa [hidden]{ display:none !important; }

/* the top: the title, the kind, the tools */
.aa-head{ display:flex; align-items:center; gap:6px; margin-bottom:4px; }
.aa-h1{ font-size:1.25rem; font-weight:700; margin:0; }
.aa-bar{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; padding:8px 0; border-bottom:1px solid var(--u-line); }
.aa-sp{ flex:1 1 0; min-width:0; }
.aa-tl{ font-size:.82rem; color:var(--u-ink2); }
.aa-type{ width:auto; max-width:100%; min-width:0; flex:0 1 auto; }
.aa-ico, .sf-ico{ width:18px; height:18px; flex:none; fill:none; stroke:currentColor; stroke-width:var(--sw,1.8); stroke-linecap:var(--cap,round); stroke-linejoin:round; }
.aa-start{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; padding:8px 10px; margin-top:8px; border:1px solid var(--u-line); border-radius:var(--u-br); background:var(--u-bg2); }
.aa-startq{ font-size:.88rem; color:var(--u-ink2); min-width:0; overflow-wrap:anywhere; }
.aa-startb{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.aa-files{ padding:8px 0; }
.aa-fl{ list-style:none; margin:0; padding:0; display:grid; gap:4px; }
.aa-fbtn{ appearance:none; display:inline-flex; align-items:center; gap:8px; min-height:32px; max-width:100%; padding:4px 10px; border:1px solid var(--u-line); border-radius:999px; background:var(--u-paper); color:var(--u-ink); font:inherit; font-size:.85rem; cursor:pointer; text-align:start; }
.aa-fbtn:hover{ background:var(--u-acc-soft); }
.aa-fbtn code{ font-family:var(--u-mono); font-size:.8rem; overflow-wrap:anywhere; word-break:break-all; background:none; border:0; padding:0; }
.aa-note{ margin:6px 0 0; font-size:.85rem; color:var(--u-ink2); }
.aa-note:empty{ display:none; }

/* the two columns */
.aa-main{ display:grid; grid-template-columns:minmax(0,1fr); gap:16px; margin-top:12px; }
@media (min-width:960px){
  .aa-main{ grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); align-items:start; }
  .aa-prev{ position:sticky; top:12px; max-height:calc(100vh - 24px); overflow:auto; }
}
.aa-edit, .aa-prev{ min-width:0; }
.aa-prev{ background:var(--u-paper); border:1px solid var(--u-line); border-radius:var(--u-br); padding:12px; }
.aa-phead{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:8px; }
.aa-h2{ font-size:1rem; margin:0; flex:1 1 auto; }
.aa-ploc{ width:auto; }
.aa-pnote{ margin:0 0 8px; font-size:.85rem; color:var(--u-ink2); }
.aa-pnote:empty{ display:none; }
.aa-pbox{ min-width:0; transition:opacity var(--u-fast); }
.aa-pbox.aa-stale{ opacity:.55; }

/* the tabs and the problems */
.aa-tabs{ display:flex; flex-wrap:wrap; gap:4px; border-bottom:1px solid var(--u-line); margin:8px 0 12px; }
.aa-tab{ appearance:none; background:none; border:0; border-bottom:2px solid transparent; margin-bottom:-1px; color:var(--u-ink2); padding:8px 12px; min-height:40px; font:inherit; font-size:.92rem; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.aa-tab:hover{ color:var(--u-ink); }
.aa-tab[aria-selected="true"]{ color:var(--u-ink); border-bottom-color:var(--u-acc); font-weight:600; }
.aa-badge{ font-size:.72rem; background:var(--u-bad); color:var(--u-bad-ink); border-radius:999px; padding:0 7px; line-height:1.5; }
.aa-probs{ font-size:.88rem; }
.aa-ok{ display:flex; align-items:center; gap:6px; color:var(--u-ok-ink); margin:0; }
.aa-pd > summary{ cursor:pointer; display:flex; align-items:center; gap:6px; color:var(--u-bad-ink); min-height:32px; }
.aa-pl{ margin:6px 0 0; padding-inline-start:18px; display:grid; gap:4px; color:var(--u-ink2); overflow-wrap:anywhere; }
.aa-pt{ font-size:.75rem; color:var(--u-ink3); text-transform:uppercase; letter-spacing:.04em; }

/* the words */
.aa-kt{ margin-top:6px; }
.aa-kt:empty{ display:none; }
.aa-ktg{ display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 8px; align-items:center; padding:6px 8px; border-inline-start:2px solid var(--u-line); }
.aa-ktl{ font-family:var(--u-mono); font-size:.75rem; color:var(--u-ink3); }
.aa-ktin{ font-size:.88rem; }
.aa-miss{ border-style:dashed !important; }
.aa-st{ display:grid; gap:8px; }
.aa-strow{ border:1px solid var(--u-line); border-radius:var(--u-br); padding:8px; background:var(--u-paper); min-width:0; }
.aa-strow.aa-unused{ opacity:.8; }
.aa-strow.aa-bad{ border-color:var(--u-bad-ink); }
.aa-stk{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-height:32px; }
.aa-stk code{ font-family:var(--u-mono); font-size:.85rem; overflow-wrap:anywhere; }
.aa-tag{ font-size:.72rem; color:var(--u-ink2); border:1px solid var(--u-line); border-radius:999px; padding:0 6px; }
.aa-addloc{ margin-top:14px; display:grid; gap:6px; }
.aa-locs{ display:flex; flex-wrap:wrap; gap:6px; }
.aa-chip{ display:inline-flex; align-items:center; gap:2px; font-family:var(--u-mono); font-size:.8rem; border:1px solid var(--u-line); border-radius:999px; padding:0 2px 0 10px; min-height:32px; }
.aa-chip:not(:has(noema-icon-button)){ padding-inline-end:10px; }
.aa-row{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.aa-locin{ width:8em; max-width:100%; }
.aa-names{ margin:4px 0 0; font-size:.78rem; color:var(--u-ink3); font-family:var(--u-mono); overflow-wrap:anywhere; }

/* ===== the generated forms (noema-schema-form) ===== */
noema-schema-form{ display:block; min-width:0; }
.sf, .sf-obj{ display:grid; gap:10px; min-width:0; }
.sf-f{ display:grid; gap:4px; min-width:0; }
.sf-fh{ display:flex; align-items:center; gap:6px; min-height:24px; }
.sf-l{ font-size:.84rem; font-weight:600; color:var(--u-ink2); overflow-wrap:anywhere; }
.sf-help{ margin:0; font-size:.8rem; color:var(--u-ink3); }
.sf-in{ width:100%; min-width:0; max-width:100%; font:inherit; font-size:.92rem; color:var(--u-ink); background:var(--u-paper); border:1px solid var(--u-line); border-radius:var(--u-ir); padding:7px 10px; min-height:38px; }
.sf-in:hover{ border-color:color-mix(in srgb, var(--u-ink3) 45%, var(--u-line)); }
select.sf-in{ padding-inline-end:28px; }
textarea.sf-in{ resize:vertical; min-height:64px; }
.sf-mono, .sf-num{ font-family:var(--u-mono); font-size:.86rem; }
.sf-in[aria-invalid="true"]{ border-color:var(--u-bad-ink); }
.sf-cb{ width:24px; height:24px; margin:0; accent-color:var(--u-acc); }
.sf-err{ margin:0; font-size:.8rem; color:var(--u-bad-ink); overflow-wrap:anywhere; }
.sf-ib{ appearance:none; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; flex:none; border:0; border-radius:999px; background:none; color:var(--u-ink2); cursor:pointer; padding:0; }
.sf-ib:hover:not([disabled]){ background:var(--u-acc-soft); color:var(--u-ink); }
.sf-ib[disabled]{ opacity:.35; cursor:default; }
.sf-fh .sf-ib{ width:28px; height:28px; margin-inline-start:auto; }
.sf-fs{ border:1px solid var(--u-line); border-radius:var(--u-br); padding:10px 12px 12px; margin:0; min-width:0; position:relative; display:grid; gap:8px; background:var(--u-paper); }
.sf-fs .sf-fs{ background:var(--u-bg); }
.sf-fs > legend{ padding:0 6px; }
.sf-fsx{ position:absolute; top:-6px; inset-inline-end:4px; }
.sf-arr{ list-style:none; margin:0; padding:0; display:grid; gap:8px; min-width:0; }
.sf-item{ min-width:0; }
.sf-card{ border:1px solid var(--u-line); border-radius:var(--u-ir); background:var(--u-paper); }
.sf-card > .sf-body{ padding:4px 10px 10px; }
.sf-card > .sf-err{ padding:0 10px; }
.sf-sum{ display:flex; align-items:center; gap:4px; min-height:40px; padding-inline:4px; }
.sf-tog{ appearance:none; flex:1 1 auto; min-width:0; display:flex; align-items:center; gap:8px; min-height:36px; padding:2px 6px; border:0; background:none; color:var(--u-ink); font:inherit; cursor:pointer; text-align:start; border-radius:var(--u-ir); }
.sf-tog:hover{ background:var(--u-acc-soft); }
.sf-tog::before{ content:''; width:7px; height:7px; border:solid var(--u-ink3); border-width:0 1.6px 1.6px 0; transform:rotate(-45deg); transition:transform var(--u-fast); flex:none; }
.sf-tog[aria-expanded="true"]::before{ transform:rotate(45deg); }
.sf-n{ font-size:.75rem; color:var(--u-ink3); font-variant-numeric:tabular-nums; min-width:1.4em; }
.sf-st{ flex:1 1 auto; min-width:0; font-family:var(--u-mono); font-size:.84rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sf-ctl{ display:inline-flex; flex:none; }
.sf-prim{ display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:4px 8px; }
.sf-prim > .sf-err{ grid-column:1 / -1; }
.sf-add{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
.sf-addbtn{ appearance:none; display:inline-flex; align-items:center; gap:6px; min-height:36px; border:1px dashed var(--u-line); background:none; color:var(--u-ink2); border-radius:999px; padding:4px 12px; cursor:pointer; font:inherit; font-size:.85rem; }
.sf-addbtn:hover:not([disabled]){ background:var(--u-acc-soft); color:var(--u-ink); }
.sf-addbtn[disabled]{ opacity:.45; cursor:default; }
.sf-more{ width:auto; max-width:100%; color:var(--u-ink2); border-style:dashed; }
.sf-cnt{ font-size:.75rem; color:var(--u-ink3); }
.sf-altrow{ display:grid; grid-template-columns:minmax(0,9em) minmax(0,1fr); gap:6px; align-items:start; }
.sf-altrow > .sf-altbody{ min-width:0; }
.sf-map{ display:grid; gap:6px; }
.sf-mrow{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto; gap:6px; align-items:end; }
.sf-mrow > .sf-f > .sf-fh{ display:none; }
.sf-mrow > .sf-err{ grid-column:1 / -1; }
.sf-unknown .sf-l{ font-family:var(--u-mono); font-weight:400; }
@media (max-width:560px){
  .aa-type{ flex:1 1 10em; }
}
@media (max-width:420px){
  .aa{ padding-inline:12px; }
  .aa-startb{ flex-direction:column; align-items:stretch; width:100%; }
  .sf-altrow{ grid-template-columns:minmax(0,1fr); }
  .sf-mrow{ grid-template-columns:minmax(0,1fr) auto; }
  .sf-mrow > .sf-f{ grid-column:1 / -1; grid-row:2; }
  .sf-fs{ padding:8px; }
  .sf-card > .sf-body{ padding:4px 6px 8px; }
  .aa-tab{ padding:8px; }
}
@media (prefers-reduced-motion: reduce){ .sf-tog::before, .aa-pbox{ transition:none; } }
[data-motion="reduced"] .sf-tog::before, [data-motion="reduced"] .aa-pbox{ transition:none; }
`;
