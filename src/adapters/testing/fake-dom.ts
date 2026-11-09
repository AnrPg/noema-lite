/** Test double: the few DOM calls the browser notifier makes (createElement, body.append, querySelector('.x'), getElementById). */
import type { DocumentLike, ElementLike } from '../browser/notifier.ts';

class FakeElement implements ElementLike {
  className = '';
  id = '';
  textContent: string | null = '';
  readonly style = { cssText: '' };
  readonly attrs = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  get isConnected(): boolean {
    let p: FakeElement | null = this.parent;
    while (p && p.tag !== 'body') p = p.parent;
    return !!p;
  }
  setAttribute(n: string, v: string): void {
    this.attrs.set(n, v);
  }
  append(...nodes: unknown[]): void {
    for (const n of nodes)
      if (n instanceof FakeElement) {
        n.parent = this;
        this.children.push(n);
      }
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  all(): FakeElement[] {
    return this.children.flatMap(c => [c, ...c.all()]);
  }
}

export function fakeDocument(): DocumentLike & { readonly bodyEl: FakeElement; toasts(): FakeElement[] } {
  const body = new FakeElement('body');
  return {
    bodyEl: body,
    body,
    createElement: tag => new FakeElement(tag),
    querySelector: sel => body.all().find(e => sel.startsWith('.') && e.className.split(' ').includes(sel.slice(1))) ?? null,
    getElementById: id => body.all().find(e => e.id === id) ?? null,
    toasts: () => body.all().filter(e => e.className.split(' ').includes('toast')),
  };
}
