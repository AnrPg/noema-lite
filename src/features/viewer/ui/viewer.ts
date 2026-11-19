/**
 * 👁 The file viewer (docs/SOURCES.md): a source file, or any file or web address, on top of the app — in Lit, light DOM
 * (engine/src/30_shell.css and the browser suites read the classes vw-*).
 *
 *   openViewer(port, { blob | url, name, type, kind, page, start, title, subtitle, onClose }) → Promise<{ close, kind }>
 *
 * A file is read by its kind (application/read.ts) and always offered for ⬇️ download and in a new tab; a YouTube address
 * plays inside (at `start`), a web page is framed unless the site refuses (/api/frame: then a card with ↗; no answer: a
 * note that can be hidden), any other address is fetched (straight,
 * else through the site's /api/file) and read. Escape or ✕ closes it.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { I18n, MessageParams } from '../../../ports/i18n.ts';
import { defineOnce, LightElement } from '../../translation/ui/light.ts';
import { fetchFile } from '../application/fetch.ts';
import type { FrameAnswer, PdfDoc, Raster, ViewerLibs, ViewerNet } from '../../../ports/viewer.ts';
import { readFile, ViewerRefusal, type View } from '../application/read.ts';
import { kindOf, nameOfUrl, youtube, type ShownKind } from '../domain/kinds.ts';
import { fmtSize } from '../domain/text.ts';

export interface ViewerUiPort {
  readonly i18n: I18n;
  readonly libs: ViewerLibs;
  readonly net: ViewerNet;
  readonly document: Document;
}
export interface OpenOptions {
  readonly blob?: Blob | null;
  readonly url?: string | null;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly kind?: string | null;
  readonly page?: number | null;
  readonly start?: number | null;
  readonly title?: string | null;
  readonly subtitle?: string | null;
  readonly onClose?: (() => void) | null;
}
export interface Opened {
  close(): void;
  readonly kind: ShownKind;
}

/** the page of a sandboxed HTML document (a file's HTML, an e-mail's HTML part): no scripts, links open outside */
const sandboxDoc = (body: string): string =>
  `<!doctype html><meta charset="utf-8"><base target="_blank"><style>body{font:16px/1.6 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#1e293b}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>${body}`;

/** a PDF's pages, drawn when they come near the screen; its tools (‹ page / n › − +) go into the viewer's bar */
export class NoemaPdfView extends LightElement {
  static override properties = { page: { type: Number }, scale: { type: Number } };
  declare page: number;
  declare scale: number;
  readonly doc: PdfDoc;
  readonly #start: number;
  readonly #onPage: () => void;
  readonly #drawn = new Map<number, number>();
  #size = { width: 612, height: 792 };
  #io: IntersectionObserver | null = null;
  #released = false;
  /** doc: this view's own (released with it) */
  constructor(i18n: I18n, doc: PdfDoc, start: number, onPage: () => void) {
    super(i18n);
    this.doc = doc;
    this.#start = start;
    this.#onPage = onPage;
    this.page = 1;
    const w = this.ownerDocument.defaultView?.innerWidth ?? 1024;
    this.scale = Math.min(1.6, (w - 48) / 640);
    this.className = 'vw-pdf';
    this.dataset['pages'] = String(doc.numPages);
    this.addEventListener(
      'scroll',
      () => {
        const t = this.scrollTop;
        let n = 1;
        for (const d of this.#pages()) {
          if (d.offsetTop - 40 <= t) n = Number(d.dataset['n']);
          else break;
        }
        if (n !== this.page) {
          this.page = n;
          this.#onPage();
        }
      },
      { passive: true },
    );
  }
  /** the first page's size, before the pages are drawn */
  async measure(): Promise<void> {
    this.#size = (await this.doc.page(1)).viewport(1);
  }
  #pages(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(':scope > .vw-page')];
  }
  /** once on the page: draws the pages that come near the screen and goes to the first page asked for */
  begin(): void {
    if (this.#io) return;
    const IO = this.ownerDocument.defaultView?.IntersectionObserver;
    if (IO) {
      this.#io = new IO(
        es => {
          for (const e of es) if (e.isIntersecting) void this.#draw(Number((e.target as HTMLElement).dataset['n']));
        },
        { rootMargin: '600px 0px' },
      );
      for (const d of this.#pages()) this.#io.observe(d);
    }
    if (this.#start > 1) this.jump(this.#start);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.release();
  }
  /** whether release() ran (a method: it changes across the awaits of a draw) */
  isReleased(): boolean {
    return this.#released;
  }
  /** pdf.js's document freed (its worker, its pages' memory) and nothing more drawn; once */
  release(): void {
    if (this.#released) return;
    this.#released = true;
    this.#io?.disconnect();
    this.#io = null;
    this.doc.destroy();
  }
  async #draw(n: number): Promise<void> {
    if (this.#released || this.#drawn.get(n) === this.scale) return;
    const scale = this.scale;
    this.#drawn.set(n, scale);
    const p = await this.doc.page(n),
      vp = p.viewport(scale),
      ratio = this.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const c = this.ownerDocument.createElement('canvas');
    c.width = Math.floor(vp.width * ratio);
    c.height = Math.floor(vp.height * ratio);
    c.style.width = String(vp.width) + 'px';
    c.style.height = String(vp.height) + 'px';
    const d = this.#pages()[n - 1];
    if (!d) return;
    d.style.width = String(vp.width) + 'px';
    d.style.height = String(vp.height) + 'px';
    if (this.isReleased()) return; // freed while the page was fetched
    await p.render(c.getContext('2d'), scale, ratio);
    d.querySelector('canvas')?.remove();
    d.prepend(c);
  }
  jump(n: number): void {
    const k = Math.max(1, Math.min(this.doc.numPages, Math.trunc(n) || 1));
    this.#pages()[k - 1]?.scrollIntoView({ block: 'start' });
    this.page = k;
    this.#onPage();
  }
  #zoom(f: number): void {
    const cur = this.page;
    this.scale = Math.max(0.4, Math.min(4, this.scale * f));
    this.#drawn.clear();
    this.redraw();
    for (const d of this.#pages()) if (d.getBoundingClientRect().bottom > -600) void this.#draw(Number(d.dataset['n']));
    this.ownerDocument.defaultView?.setTimeout(() => {
      this.jump(cur);
    }, 30);
  }
  tools(): TemplateResult {
    return html`<button
        class="vw-btn"
        type="button"
        aria-label=${this.t('loader.viewer.prevPage')}
        @click=${(): void => {
          this.jump(this.page - 1);
        }}
      >
        ‹</button
      ><input
        class="vw-pgin"
        type="number"
        min="1"
        max=${this.doc.numPages}
        .value=${String(this.page)}
        aria-label=${this.t('loader.viewer.page')}
        @change=${(e: Event): void => {
          this.jump(Number((e.target as HTMLInputElement).value));
        }}
      /><span class="vw-pg">/ ${this.i18n.format.number(this.doc.numPages)}</span
      ><button
        class="vw-btn"
        type="button"
        aria-label=${this.t('loader.viewer.nextPage')}
        @click=${(): void => {
          this.jump(this.page + 1);
        }}
      >
        ›</button
      ><button
        class="vw-btn"
        type="button"
        aria-label=${this.t('loader.viewer.zoomOut')}
        @click=${(): void => {
          this.#zoom(1 / 1.2);
        }}
      >
        −</button
      ><button
        class="vw-btn"
        type="button"
        aria-label=${this.t('loader.viewer.zoomIn')}
        @click=${(): void => {
          this.#zoom(1.2);
        }}
      >
        +
      </button>`;
  }
  override render(): TemplateResult {
    const w = String(this.#size.width * this.scale) + 'px',
      h = String(this.#size.height * this.scale) + 'px';
    return html`${Array.from(
      { length: this.doc.numPages },
      (_x, i) => html`<div class="vw-page" data-n=${i + 1} style=${`width:${w};height:${h}`}><span class="vw-pgno">${i + 1}</span></div>`,
    )}`;
  }
}

/** a TIFF's images on canvases */
function rasters(doc: Document, images: readonly Raster[]): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 'vw-center vw-col';
  for (const r of images) {
    const c = doc.createElement('canvas');
    c.width = r.width;
    c.height = r.height;
    c.className = 'vw-img';
    const ctx = c.getContext('2d');
    if (ctx) {
      const im = ctx.createImageData(r.width, r.height);
      im.data.set(r.rgba);
      ctx.putImageData(im, 0, 0);
    }
    wrap.append(c);
  }
  return wrap;
}

/** how long the viewer waits for the site's answer before it frames the page anyway, and for a framed page to load */
const FRAME_CHECK_MS = 6000,
  FRAME_SLOW_MS = 15000;

type Body =
  | { readonly s: 'loading' }
  | { readonly s: 'view'; readonly view: View }
  | { readonly s: 'youtube'; readonly src: string }
  /* a web page: 'check' while the site asks whether it may be framed; 'no' → a card with ↗; 'yes' → the frame;
     'unknown' (no answer, or the page loads too slowly) → the frame with a note the learner can hide */
  | { readonly s: 'web'; readonly src: string; readonly frame: 'check' | FrameAnswer; readonly note: boolean }
  | { readonly s: 'fail'; readonly text: string; readonly link: string | null };

/** The overlay: its head (title, kind and size, the PDF's tools, ⬇️ ↗, ✕) and the file. */
export class NoemaFileViewer extends LightElement {
  static override properties = { body: { attribute: false } };
  declare body: Body;
  readonly #port: ViewerUiPort;
  readonly #o: OpenOptions;
  readonly #urls: string[] = [];
  #sub: string;
  #links: { download: string | null; name: string; site: string | null } = { download: null, name: '', site: null };
  #pdf: NoemaPdfView | null = null;
  #sheet = '';
  #closed = false;
  kind: ShownKind = 'unknown';
  readonly #esc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };
  constructor(port: ViewerUiPort, o: OpenOptions) {
    super(port.i18n);
    this.#port = port;
    this.#o = o;
    this.body = { s: 'loading' };
    this.#sub = o.subtitle ?? '';
    this.className = 'vw-ov';
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-modal', 'true');
    this.setAttribute('aria-label', this.t('loader.viewer.preview', { name: o.title || o.name || this.t('loader.viewer.fileLower') }));
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.ownerDocument.addEventListener('keydown', this.#esc);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.ownerDocument.removeEventListener('keydown', this.#esc);
    if (!this.#closed) this.#end();
  }
  #end(): void {
    this.#closed = true;
    this.#pdf?.release(); // also when it was never shown (closed while its first page was measured)
    for (const u of this.#urls.splice(0)) this.#port.libs.revoke(u);
    this.#o.onClose?.();
  }
  /** whether it was closed (a method: it changes across the awaits of a load) */
  isClosed(): boolean {
    return this.#closed;
  }
  close(): void {
    if (this.#closed) return;
    this.#end();
    this.remove();
  }
  #url(blob: Blob): string {
    const u = this.#port.libs.url(blob);
    this.#urls.push(u);
    return u;
  }
  #show(b: Body): void {
    this.body = b;
    this.redraw();
  }

  /** asks whether the page may be framed here; a frame that has not loaded after FRAME_SLOW_MS gets the note */
  async #checkFrame(src: string): Promise<void> {
    const answer = await Promise.race([
      this.#port.net.frame(src).catch((): FrameAnswer => 'unknown'),
      new Promise<FrameAnswer>(res =>
        setTimeout(() => {
          res('unknown');
        }, FRAME_CHECK_MS),
      ),
    ]);
    const b = this.body;
    if (this.isClosed() || b.s !== 'web' || b.src !== src) return;
    this.#show({ ...b, frame: answer, note: answer === 'unknown' });
    if (answer !== 'yes') return;
    setTimeout(() => {
      const now = this.body;
      if (!this.isClosed() && now.s === 'web' && now.src === src && now.frame === 'yes' && !this.#frameLoaded)
        this.#show({ ...now, note: true });
    }, FRAME_SLOW_MS);
  }
  #frameLoaded = false;

  /** reads the file (or the address) and shows it → its kind */
  async load(): Promise<ShownKind> {
    const o = this.#o,
      P = this.#port;
    try {
      let blob = o.blob ?? null;
      const name = o.name || (o.url ? nameOfUrl(o.url) : 'file');
      if (!blob && o.url) {
        this.#links = { ...this.#links, site: o.url };
        const yt = youtube(o.url, o.start);
        if (yt) {
          this.#show({ s: 'youtube', src: yt });
          return (this.kind = 'youtube');
        }
        if (kindOf(name) === 'unknown' || kindOf(name) === 'html') {
          // a web page: framed, unless the site refuses to be framed (then a card with ↗)
          this.#show({ s: 'web', src: o.url, frame: 'check', note: false });
          void this.#checkFrame(o.url);
          return (this.kind = 'web');
        }
        const got = await fetchFile(o.url, P.net);
        if ('error' in got) {
          this.#show({
            s: 'fail',
            text: got.error
              ? this.t('loader.viewer.noDownloadWhy', { error: this.i18n.err(got.error) })
              : this.t('loader.viewer.noDownload'),
            link: o.url,
          });
          return (this.kind = 'error');
        }
        blob = got.blob;
      }
      if (!blob) throw new ViewerRefusal('empty');
      const kind = (o.kind && o.kind in READ_KINDS ? o.kind : kindOf(name, o.type ?? blob.type)) as Exclude<
        ShownKind,
        'youtube' | 'web' | 'error'
      >;
      this.#sub = [o.subtitle, this.t('loader.viewer.kind.' + kind), fmtSize(blob.size, (n, x) => this.i18n.format.number(n, x))]
        .filter(Boolean)
        .join(' · ');
      this.#links = { ...this.#links, download: this.#url(blob), name };
      this.redraw();
      const libs: ViewerLibs = { ...P.libs, url: b => this.#url(b) };
      const view = await readFile(kind, { blob, bytes: await blob.arrayBuffer(), name, page: o.page ?? undefined }, libs);
      if (view.type === 'pdf') {
        if (this.isClosed()) {
          view.doc.destroy(); // closed (or replaced) while the file was read
          return (this.kind = kind);
        }
        this.#pdf = new NoemaPdfView(this.i18n, view.doc, view.page, () => {
          this.redraw();
        });
        await this.#pdf.measure();
        if (this.isClosed()) return (this.kind = kind); // closed while its first page was measured: #end released it
      }
      if (view.type === 'sheet') this.#sheet = view.names[0] ?? '';
      this.#show({ s: 'view', view });
      this.dataset['kind'] = kind;
      return (this.kind = kind);
    } catch (e) {
      console.warn('[viewer]', e); // the learner sees the reason below
      const text =
        e instanceof ViewerRefusal ? this.t('loader.viewer.' + e.key) : this.t('loader.viewer.failed', { error: this.i18n.err(e) });
      this.#show({ s: 'fail', text, link: null });
      return (this.kind = 'error');
    }
  }

  #view(v: View): unknown {
    const T = (k: string, p?: MessageParams): string => this.t('loader.viewer.' + k, p);
    const pre = (t: string, cls = ''): TemplateResult => html`<pre class=${'vw-pre' + cls}>${t}</pre>`;
    const frame = (src: string): TemplateResult =>
      html`<iframe
        class="vw-frame"
        .srcdoc=${sandboxDoc(src)}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerpolicy="no-referrer"
      ></iframe>`;
    switch (v.type) {
      case 'pdf':
        return this.#pdf ?? nothing;
      case 'frame':
        return html`<iframe class="vw-frame" src=${v.url}></iframe>`;
      case 'image':
        return html`<div class="vw-center">
          <img
            class="vw-img"
            src=${v.url}
            alt=""
            @click=${(e: Event): void => {
              (e.currentTarget as HTMLElement).classList.toggle('zoom');
            }}
          />
        </div>`;
      case 'rasters':
        return rasters(this.ownerDocument, v.images);
      case 'pre':
        return pre(v.text);
      case 'table':
        return html`<div class="vw-scroll">
          <table class="vw-table">
            ${v.rows.map(
              (r, i) =>
                html`<tr>
                  ${r.map(c => (i ? html`<td>${c}</td>` : html`<th>${c}</th>`))}
                </tr>`,
            )}
          </table>
        </div>`;
      case 'html':
        return html`<div class="vw-doc">${unsafeHTML(v.html)}</div>`;
      case 'sandbox':
        return frame(v.html);
      case 'blocks':
        return html`<div class="vw-doc">
          ${v.blocks.map(b => ('h' in b ? html`<h3>${b.h}</h3>` : 'p' in b ? html`<p>${b.p}</p>` : html`<hr />`))}
          ${v.empty ? html`<p>${T(v.empty)}</p>` : nothing}
        </div>`;
      case 'sheet':
        return html`<div class="vw-sheet">
          <div class="vw-tabs" role="tablist">
            ${v.names.map(
              n =>
                html`<button
                  class=${'vw-tab' + (n === this.#sheet ? ' on' : '')}
                  type="button"
                  role="tab"
                  aria-selected=${String(n === this.#sheet)}
                  @click=${(): void => {
                    this.#sheet = n;
                    this.redraw();
                  }}
                >
                  ${n}
                </button>`,
            )}
          </div>
          <div class="vw-scroll">${unsafeHTML(v.html(this.#sheet))}</div>
        </div>`;
      case 'slides':
        return html`<div class="vw-slides">
          ${v.slides.map(
            (s, i) =>
              html`<div class="vw-slide">
                <div class="vw-slideno">${T('slide', { n: i + 1 })}</div>
                ${s.texts.map(t => html`<p>${t}</p>`)} ${s.images.map(u => html`<img class="vw-img" src=${u} alt="" />`)}
              </div>`,
          )}
          ${v.slides.length ? nothing : html`<p>${T('noSlides')}</p>`}
        </div>`;
      case 'notebook':
        return html`<div class="vw-doc">
          ${v.cells.map(c =>
            'md' in c
              ? html`<div>${unsafeHTML(c.md)}</div>`
              : html`${pre(c.code, ' vw-code')}${c.outputs.map(o =>
                  'png' in o ? html`<img class="vw-img" src=${'data:image/png;base64,' + o.png} alt="" />` : pre(o.text, ' vw-out'),
                )}`,
          )}
        </div>`;
      case 'mail':
        return html`<div class="vw-col">
          <div class="vw-mailhead">${v.head.map(([k, x]) => html`<div><b>${T('mail.' + k)}: </b>${x}</div>`)}</div>
          ${v.html != null ? frame(v.html) : pre(v.text ?? T('empty'))}
        </div>`;
      case 'zip':
        return html`<div class="vw-scroll">
          <p class="vw-note">${T('nFiles', { n: v.total })}</p>
          <table class="vw-table">
            <tr>
              <th>${T('zipFile')}</th>
              <th>${T('zipSize')}</th>
              <th></th>
            </tr>
            ${v.entries.map(
              f =>
                html`<tr>
                  <td>${f.name}</td>
                  <td>${fmtSize(f.size, (n, x) => this.i18n.format.number(n, x))}</td>
                  <td>
                    <button
                      class="vw-btn"
                      type="button"
                      @click=${async (): Promise<void> => {
                        const inner = await f.open();
                        await openViewer(this.#port, { ...inner });
                      }}
                    >
                      👁 ${T('open')}
                    </button>
                  </td>
                </tr>`,
            )}
          </table>
        </div>`;
      case 'media':
        return html`<div class="vw-center">
          ${
            v.kind === 'audio'
              ? html`<audio controls class="vw-media" src=${v.url}></audio>`
              : html`<video controls playsinline class="vw-media" src=${v.url}></video>`
          }
        </div>`;
      case 'legacy':
        return html`<div class="vw-col">
          <p class="vw-note">${T('legacy')}</p>
          ${pre(v.text || T('noReadable'))}
        </div>`;
      case 'unknown':
        return html`<div class="vw-col">
          <p class="vw-note">${T('unknown')}</p>
          ${pre(v.hex)}
          ${
            v.readable
              ? html`<details>
                  <summary>${T('readable')}</summary>
                  ${pre(v.readable)}
                </details>`
              : nothing
          }
        </div>`;
    }
  }

  #bodyOf(): unknown {
    const b = this.body,
      T = (k: string): string => this.t('loader.viewer.' + k);
    switch (b.s) {
      case 'loading':
        return html`<div class="vw-loading">⏳ ${T('opening')}</div>`;
      case 'youtube':
        return html`<iframe
          class="vw-frame vw-yt"
          src=${b.src}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          title=${this.#o.title ?? T('file')}
        ></iframe>`;
      case 'web':
        if (b.frame === 'check') return html`<div class="vw-loading">⏳ ${T('opening')}</div>`;
        if (b.frame === 'no')
          return html`<div class="vw-center vw-col vw-blocked">
            <p class="vw-note">${T('webBlocked')}</p>
            <a class="vw-btn" href=${b.src} target="_blank" rel="noopener">↗ ${T('webOpen')}</a>
          </div>`;
        return html`<div class="vw-web">
          ${
            b.note
              ? html`<div class="vw-hint" role="note">
                  <span>${T('webNote')}</span>
                  <button
                    class="vw-x"
                    type="button"
                    title=${T('hideNote')}
                    aria-label=${T('hideNote')}
                    @click=${(): void => {
                      this.#show({ ...b, note: false });
                    }}
                  >
                    ✕
                  </button>
                </div>`
              : nothing
          }
          <iframe
            class="vw-frame"
            src=${b.src}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerpolicy="no-referrer"
            title=${this.#o.title ?? T('file')}
            @load=${(): void => {
              this.#frameLoaded = true;
            }}
          ></iframe>
        </div>`;
      case 'fail':
        return html`<div class="vw-center vw-col">
          <p class="vw-note">⚠️ ${b.text}</p>
          ${b.link ? html`<a class="vw-btn" href=${b.link} target="_blank" rel="noopener">↗ ${T('openOriginal')}</a>` : nothing}
        </div>`;
      case 'view':
        return this.#view(b.view);
    }
  }

  override updated(): void {
    if (this.#pdf?.isConnected && !this.#pdf.hasUpdated) this.#pdf.redraw();
    if (this.#pdf?.isConnected) this.#pdf.begin();
  }

  override render(): TemplateResult {
    const T = (k: string): string => this.t('loader.viewer.' + k),
      L = this.#links;
    return html`<div class="vw-head">
        <div class="vw-title"><b>${this.#o.title || this.#o.name || T('file')}</b><span class="vw-sub">${this.#sub}</span></div>
        <div class="vw-tools">${this.body.s === 'view' && this.#pdf ? this.#pdf.tools() : nothing}</div>
        <div class="vw-right">
          ${L.site ? html`<a class="vw-btn" href=${L.site} target="_blank" rel="noopener">↗ ${T('openSite')}</a>` : nothing}
          ${
            L.download
              ? html`<a class="vw-btn" href=${L.download} download=${L.name} title=${T('download')} aria-label=${T('download')}>⬇️</a
                  ><a class="vw-btn" href=${L.download} target="_blank" rel="noopener" title=${T('newTab')} aria-label=${T('newTab')}>↗</a>`
              : nothing
          }
        </div>
        <button
          class="vw-btn vw-close"
          type="button"
          aria-label=${this.t('loader.close')}
          @click=${(): void => {
            this.close();
          }}
        >
          ✕
        </button>
      </div>
      <div class="vw-body">${this.#bodyOf()}</div>`;
  }
}

/** the kinds a caller may name (o.kind) */
const READ_KINDS: Readonly<Record<string, true>> = Object.fromEntries(
  [
    'pdf',
    'image',
    'heic',
    'tiff',
    'markdown',
    'csv',
    'json',
    'html',
    'text',
    'docx',
    'odt',
    'rtf',
    'sheet',
    'pptx',
    'epub',
    'ipynb',
    'eml',
    'zip',
    'audio',
    'video',
    'legacy',
    'unknown',
  ].map(k => [k, true]),
);

export function defineViewerUi(registry: CustomElementRegistry | undefined = globalThis.customElements): void {
  defineOnce(registry, 'noema-pdf-view', NoemaPdfView);
  defineOnce(registry, 'noema-file-viewer', NoemaFileViewer);
}

/** Opens a file over the app (one viewer at a time) → { close, kind } once it is shown. */
export async function openViewer(port: ViewerUiPort, o: OpenOptions): Promise<Opened> {
  defineViewerUi(port.document.defaultView?.customElements);
  port.document.querySelector<NoemaFileViewer>('.vw-ov')?.remove();
  const v = new NoemaFileViewer(port, { ...o, onClose: o.onClose ?? null });
  port.document.body.append(v.redraw());
  v.querySelector<HTMLElement>('.vw-close')?.focus({ preventScroll: true });
  const kind = await v.load();
  return {
    close: () => {
      v.close();
    },
    kind,
  };
}
