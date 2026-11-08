/* The component kit in a DOM (happy-dom): names, roles and states for assistive technology, keyboard behaviour, events,
   the words from the catalogs (and their language changes). Form association and layout are checked in a real browser
   (tests/ui_kit.js). */
import './dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { policyNotifier } from '../../adapters/local/notifier-policy.ts';
import { NOTIFIER_RULES } from '../../ports/notifier.ts';
import { deepActiveElement } from '../core/focus.ts';
import { defineUi, ELEMENTS } from '../index.ts';
import { levelName, nameChain } from '../kit/level-badge.ts';
import { $, key, mount, settle, testServices } from './services.ts';

defineUi();
afterEach(() => {
  document.body.replaceChildren();
});

/** an element of the kit, in a container with these services, drawn */
async function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  set: (el: HTMLElementTagNameMap[K]) => void = () => undefined,
  services = testServices(),
): Promise<HTMLElementTagNameMap[K]> {
  const host = mount(services);
  const el = document.createElement(tag);
  set(el);
  host.append(el);
  await settle(host);
  return el;
}

test('defineUi defines every element once (again: nothing happens)', () => {
  defineUi();
  for (const tag of Object.keys(ELEMENTS)) assert.ok(customElements.get(tag), tag);
});

describe('buttons', () => {
  test('a button is a native button; disabled; busy; with href a link', async () => {
    const b = await make('noema-button', el => {
      el.variant = 'primary';
      el.textContent = 'Go';
    });
    const inner = $<HTMLButtonElement>(b, 'button');
    assert.equal(inner.type, 'button');
    assert.ok(inner.classList.contains('primary'));
    b.disabled = true;
    b.busy = true;
    await b.updateComplete;
    assert.ok(inner.disabled);
    assert.equal(inner.getAttribute('aria-busy'), 'true');
    const a = await make('noema-button', el => {
      el.href = '#/x';
    });
    assert.equal($<HTMLAnchorElement>(a, 'a').getAttribute('href'), '#/x');
  });
  test('an icon button has a name and a tip; a toggle tells aria-pressed; a count is part of its name', async () => {
    const b = await make('noema-icon-button', el => {
      el.icon = 'bell';
      el.label = 'Notifications';
      el.badge = 3;
    });
    const inner = $(b, 'button');
    assert.equal(inner.getAttribute('aria-label'), 'Notifications: 3');
    assert.equal(inner.getAttribute('title'), 'Notifications');
    assert.equal(inner.getAttribute('aria-pressed'), null);
    assert.equal($(b, '.badge').getAttribute('aria-hidden'), 'true');
    const t = await make('noema-icon-button', el => {
      el.icon = 'star';
      el.label = 'Favourite';
      el.toggle = true;
    });
    const got: boolean[] = [];
    t.addEventListener('noema-toggle', e => got.push((e as CustomEvent<{ pressed: boolean }>).detail.pressed));
    $(t, 'button').click();
    await t.updateComplete;
    assert.equal($(t, 'button').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(got, [true]);
  });
});

describe('menu', () => {
  async function menu(): Promise<HTMLElementTagNameMap['noema-menu']> {
    return make('noema-menu', m => {
      m.label = 'More';
      for (const [v, text, disabled] of [
        ['edit', 'Edit', false],
        ['export', 'Export', false],
        ['locked', 'Locked', true],
        ['share', 'Share', false],
      ] as const) {
        const it = document.createElement('noema-menu-item');
        it.value = v;
        it.textContent = text;
        it.disabled = disabled;
        m.append(it);
      }
    });
  }
  test('the button names the menu and tells whether it is open; items are menuitems', async () => {
    const m = await menu();
    const btn = $(m, 'button.trigger');
    assert.equal(btn.getAttribute('aria-label'), 'More');
    assert.equal(btn.getAttribute('aria-haspopup'), 'menu');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal($(m, '[role="menu"]').hidden, true);
    assert.ok(m.items.every(i => i.getAttribute('role') === 'menuitem' && i.tabIndex === -1));
    assert.equal(m.items[2]?.getAttribute('aria-disabled'), 'true');
  });
  test('↓ on the button opens on the first item; ↓ ↑ skip the disabled one; type-ahead; Enter chooses and focus returns', async () => {
    const m = await menu();
    const btn = $(m, 'button.trigger');
    btn.focus();
    key(btn, 'ArrowDown');
    await settle(m);
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.equal(deepActiveElement(), m.items[0]);
    const panel = $(m, '[role="menu"]');
    key(panel, 'ArrowDown');
    key(panel, 'ArrowDown');
    assert.equal(deepActiveElement(), m.items[3], 'Locked is skipped');
    key(panel, 'ArrowDown');
    assert.equal(deepActiveElement(), m.items[0], 'wraps');
    key(panel, 'e');
    assert.equal(deepActiveElement(), m.items[1], 'type-ahead: the next item with e');
    const chosen: string[] = [];
    m.addEventListener('noema-select', e => chosen.push((e as CustomEvent<{ value: string }>).detail.value));
    key(panel, 'Enter');
    await settle(m);
    assert.deepEqual(chosen, ['export']);
    assert.equal(m.open, false);
    assert.equal(deepActiveElement(), btn, 'focus is back on the button');
  });
  test('↑ opens on the last item; Escape closes and gives focus back; a press outside closes', async () => {
    const m = await menu();
    const btn = $(m, 'button.trigger');
    btn.focus();
    key(btn, 'ArrowUp');
    await settle(m);
    assert.equal(deepActiveElement(), m.items[3]);
    key(m.items[3] as Element, 'Escape');
    await settle(m);
    assert.equal(m.open, false);
    assert.equal(deepActiveElement(), btn);
    m.show();
    await settle(m);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    await settle(m);
    assert.equal(m.open, false);
  });
  test('a click on a disabled item does nothing; a click on an item chooses it', async () => {
    const m = await menu();
    m.show();
    await settle(m);
    const chosen: string[] = [];
    m.addEventListener('noema-select', e => chosen.push((e as CustomEvent<{ value: string }>).detail.value));
    m.items[2]?.click();
    assert.equal(m.open, true);
    m.items[3]?.click();
    await settle(m);
    assert.deepEqual(chosen, ['share']);
    assert.equal(m.open, false);
  });
});

describe('dialog', () => {
  test('opens modal with its title as name and focus on autofocus; ✕ and Escape close it; focus goes back', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const d = await make('noema-dialog', el => {
      el.heading = 'Rename';
      const f = document.createElement('input');
      f.autofocus = true;
      el.append(f);
    });
    const closed: string[] = [];
    d.addEventListener('noema-close', e => closed.push((e as CustomEvent<{ value: string }>).detail.value));
    d.show();
    await settle(d);
    const dlg = $<HTMLDialogElement>(d, 'dialog');
    assert.ok(dlg.open);
    assert.equal(dlg.getAttribute('aria-labelledby'), $(d, 'h2').id);
    assert.equal($(d, 'h2').textContent, 'Rename');
    assert.equal(deepActiveElement(), d.querySelector('input'));
    assert.equal($(d, 'button.x').getAttribute('aria-label'), 'Close');
    key(document.body, 'Escape');
    await settle(d);
    assert.equal(dlg.open, false);
    assert.deepEqual(closed, ['dismiss']);
    assert.equal(deepActiveElement(), opener);
    d.show();
    await settle(d);
    d.close('ok');
    await settle(d);
    assert.deepEqual(closed, ['dismiss', 'ok']);
    assert.equal(document.documentElement.style.overflow, '', 'the page scrolls again');
  });
  test('a question that must be answered: no ✕, Escape does nothing; focus on the title without autofocus', async () => {
    const d = await make('noema-dialog', el => {
      el.heading = 'Choose';
      el.dismissible = false;
    });
    d.show();
    await settle(d);
    assert.throws(() => $(d, 'button.x'));
    assert.equal(deepActiveElement(), $(d, 'h2'));
    assert.equal(document.documentElement.style.overflow, 'hidden');
    key(document.body, 'Escape');
    await settle(d);
    assert.ok(d.open);
    d.close('a');
    await settle(d);
  });
  test('a menu inside a dialog: Escape closes the menu first, then the dialog', async () => {
    const d = await make('noema-dialog', el => {
      el.heading = 'With a menu';
      const m = document.createElement('noema-menu');
      m.label = 'More';
      const it = document.createElement('noema-menu-item');
      it.value = 'a';
      it.textContent = 'A';
      m.append(it);
      el.append(m);
    });
    d.show();
    await settle(d);
    const m = d.querySelector('noema-menu');
    m?.show();
    await settle(d);
    key(document.body, 'Escape');
    await settle(d);
    assert.equal(m?.open, false);
    assert.ok(d.open);
    key(document.body, 'Escape');
    await settle(d);
    assert.equal(d.open, false);
  });
});

describe('toaster + the notifier policy', () => {
  test('toasts fade after their time; notices are status messages, at most two, the rest overflow; alerts reach the live region', async () => {
    const s = testServices();
    const t = await make('noema-toaster', undefined, s);
    const n = policyNotifier(t, { now: () => s.clock.now() });
    const over: string[][] = [];
    n.onOverflow(list => over.push(list.map(x => x.text)));
    n.toast('Saved');
    assert.deepEqual(t.shown, [{ text: 'Saved', kind: 'toast' }]);
    await settle(t);
    assert.equal($(t, '.t').getAttribute('role'), 'none');
    assert.equal($(t, '.t button').getAttribute('aria-label'), 'Dismiss');
    s.clock.advance(NOTIFIER_RULES.toastMs + 1);
    assert.deepEqual(t.shown, []);
    n.notice('One');
    n.notice('Two');
    await settle(t);
    assert.equal(t.shadowRoot?.querySelectorAll('.t[role="status"]').length, 2);
    n.notice('Three');
    assert.deepEqual(over, [['One', 'Two', 'Three']]);
    assert.deepEqual(t.shown, []);
    n.alert('Full');
    await settle(t);
    assert.equal($(t, '[role="alert"]').textContent, '', 'emptied first');
    s.clock.advance(60);
    await settle(t);
    assert.equal($(t, '[role="alert"]').textContent, 'Full');
    assert.equal($(t, '[role="alert"]').getAttribute('aria-live'), 'assertive');
    $<HTMLButtonElement>(t, '.t.alert button').click();
    assert.deepEqual(t.shown, []);
  });
});

describe('tabs', () => {
  const tabs = [
    { id: 'theory', label: 'Theory' },
    { id: 'practice', label: 'Practice', badge: 3 },
    { id: 'traps', label: 'Traps' },
  ];
  test('tab list, tabs, the panel labelled by the selected tab; arrows select (swapped right to left), Home End', async () => {
    const el = await make('noema-tabs', t => {
      t.tabs = tabs;
      t.selected = 'theory';
      t.label = 'Chapter 2';
      for (const id of ['theory', 'practice', 'traps']) {
        const p = document.createElement('p');
        p.slot = id;
        p.textContent = id;
        t.append(p);
      }
    });
    const list = $(el, '[role="tablist"]');
    assert.equal(list.getAttribute('aria-label'), 'Chapter 2');
    const all = (): HTMLElement[] => [...(el.shadowRoot?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    assert.deepEqual(
      all().map(t => [t.getAttribute('aria-selected'), t.tabIndex]),
      [
        ['true', 0],
        ['false', -1],
        ['false', -1],
      ],
    );
    assert.equal($(el, '[role="tabpanel"]').getAttribute('aria-labelledby'), all()[0]?.id);
    assert.match(all()[1]?.textContent ?? '', /waiting: 3/);
    const changes: string[] = [];
    el.addEventListener('noema-change', e => changes.push((e as CustomEvent<{ id: string }>).detail.id));
    key(all()[0] as Element, 'ArrowRight');
    await settle(el);
    assert.equal(el.selected, 'practice');
    assert.equal($(el, '[role="tabpanel"] slot').getAttribute('name'), 'practice');
    assert.equal(deepActiveElement(), all()[1]);
    key(all()[1] as Element, 'End');
    await settle(el);
    assert.equal(el.selected, 'traps');
    assert.deepEqual(changes, ['practice', 'traps']);
  });
  test('right to left: ← moves forward', async () => {
    const el = await make(
      'noema-tabs',
      t => {
        t.tabs = tabs;
        t.selected = 'theory';
      },
      testServices('ar-EG'),
    );
    key($(el, '[role="tab"]'), 'ArrowLeft');
    await settle(el);
    assert.equal(el.selected, 'practice');
  });
});

describe('chips, card, tip, list, fold, progress, level', () => {
  test('a toggle chip tells aria-pressed; a removable one has a named ✕', async () => {
    const c = await make('noema-chip', el => {
      el.toggle = true;
      el.textContent = 'Only due';
    });
    assert.equal($(c, 'button').getAttribute('aria-pressed'), 'false');
    $(c, 'button').click();
    await c.updateComplete;
    assert.equal($(c, 'button').getAttribute('aria-pressed'), 'true');
    const r = await make('noema-chip', el => {
      el.removable = true;
      el.textContent = 'Chapter 3';
    });
    let removed = 0;
    r.addEventListener('noema-remove', () => removed++);
    assert.equal($(r, 'button.rm').getAttribute('aria-label'), 'Remove Chapter 3');
    $(r, 'button.rm').click();
    assert.equal(removed, 1);
    const g = await make('noema-chips', el => {
      el.label = 'Filters';
    });
    assert.deepEqual([g.getAttribute('role'), g.getAttribute('aria-label')], ['group', 'Filters']);
  });
  test('a card with href: its title is the link, in a heading', async () => {
    const c = await make('noema-card', el => {
      el.heading = 'Mechanics';
      el.href = '#/subject';
    });
    const h = $(c, '[role="heading"]');
    assert.equal(h.getAttribute('aria-level'), '3');
    assert.equal(h.querySelector('a')?.getAttribute('href'), '#/subject');
  });
  test('ⓘ: a named button that shows its words; Escape hides and refocuses', async () => {
    const t = await make('noema-tip', el => {
      el.topic = 'Bite-size reading';
      el.textContent = 'Short parts';
    });
    const b = $(t, 'button');
    assert.equal(b.getAttribute('aria-label'), 'About: Bite-size reading');
    assert.equal(b.getAttribute('aria-expanded'), 'false');
    b.click();
    await settle(t);
    assert.equal(b.getAttribute('aria-expanded'), 'true');
    assert.equal($(t, '[role="status"]').hidden, false);
    key(document.body, 'Escape');
    await settle(t);
    assert.equal(t.open, false);
    assert.equal(deepActiveElement(), b);
  });
  test('a list and its items; a fold is a button in a heading with the region it controls', async () => {
    const l = await make('noema-list', el => {
      el.label = 'Subjects';
      const it = document.createElement('noema-list-item');
      it.heading = 'Mechanics';
      it.href = '#/s';
      el.append(it);
    });
    assert.equal(l.getAttribute('role'), 'list');
    const item = l.querySelector('noema-list-item');
    assert.ok(item);
    assert.equal(item.getAttribute('role'), 'listitem');
    assert.equal($(item, 'a.h').textContent, 'Mechanics');
    const f = await make('noema-collapsible', el => {
      el.heading = 'Fairy tales';
      el.headingLevel = 3;
    });
    const btn = $(f, 'button');
    assert.equal(btn.closest('[role="heading"]')?.getAttribute('aria-level'), '3');
    assert.equal(btn.getAttribute('aria-expanded'), 'false');
    assert.equal($(f, '[role="region"]').hidden, true);
    btn.click();
    await f.updateComplete;
    assert.equal(btn.getAttribute('aria-expanded'), 'true');
    assert.equal($(f, '[role="region"]').hidden, false);
  });
  test('progress: a named progressbar with its value, in the locale’s numbers; indeterminate without a value', async () => {
    const p = await make('noema-progress', el => {
      el.label = 'Mastery';
      el.value = 0.4;
    });
    const bar = $(p, '[role="progressbar"]');
    assert.deepEqual(
      ['aria-label', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext'].map(a => bar.getAttribute(a)),
      ['Mastery', '40', '0', '100', '40%'],
    );
    const r = await make('noema-progress', el => {
      el.kind = 'ring';
      el.label = 'Goal';
      el.value = 80;
      el.max = 120;
      el.show = 'count';
    });
    assert.equal($(r, '.n').textContent, '80 / 120');
    assert.equal($(r, '[role="progressbar"]').getAttribute('aria-valuenow'), '67');
    const i = await make('noema-progress', el => {
      el.label = 'Preparing';
    });
    assert.equal($(i, '[role="progressbar"]').getAttribute('aria-valuenow'), null);
    assert.equal($(i, '[role="progressbar"]').getAttribute('aria-valuetext'), 'In progress');
  });
  test('a level: its name along the locale’s chain, the kind and its place in one phrase', async () => {
    const level = { id: 'y2', kind: 'year', order: 2, names: { en: 'Year 2', el: 'Έτος 2', pt: 'Ano 2' } } as const;
    assert.deepEqual(nameChain('pt-PT'), ['pt-PT', 'pt', 'en']);
    assert.deepEqual(nameChain('zh-Hant'), ['zh-Hant', 'en']);
    assert.equal(levelName(level, 'pt-PT'), 'Ano 2');
    assert.equal(levelName(level, 'ja'), 'Year 2');
    assert.equal(levelName({ id: 'x', names: {} }, 'en'), 'x');
    const b = await make('noema-level-badge', el => {
      el.level = level;
      el.of = 4;
      el.state = 'current';
    });
    assert.equal($(b, '[role="img"]').getAttribute('aria-label'), 'Study year: Year 2, level 2 of 4, your level');
    const s = testServices('el');
    const g = await make(
      'noema-level-badge',
      el => {
        el.level = level;
        el.state = 'done';
      },
      s,
    );
    assert.equal($(g, '[role="img"]').getAttribute('aria-label'), 'Έτος σπουδών: Έτος 2, ολοκληρώθηκε');
    s.i18n.use('fr');
    await settle(g);
    assert.equal($(g, '[role="img"]').getAttribute('aria-label'), 'Année d’études : Year 2, terminé', 'redrawn in the new language');
  });
});

describe('forms', () => {
  test('a text field: its label is tied to the input, hint and error describe it, required is said', async () => {
    const f = await make('noema-text-field', el => {
      el.label = 'Name';
      el.hint = 'As others see it';
      el.required = true;
    });
    const input = $<HTMLInputElement>(f, 'input');
    const label = $<HTMLLabelElement>(f, 'label');
    assert.equal(label.htmlFor, input.id);
    assert.match(label.textContent, /Name\s+\(required\)/);
    assert.equal(input.getAttribute('aria-describedby'), $(f, '.hint').id);
    assert.ok(input.required);
    f.error = 'Write a name';
    await f.updateComplete;
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(input.getAttribute('aria-describedby'), `${$(f, '.hint').id} ${$(f, '.err').id}`);
    const seen: string[] = [];
    f.addEventListener('noema-change', e => seen.push((e as CustomEvent<{ value: string }>).detail.value));
    input.value = 'Ada';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    assert.equal(f.value, 'Ada');
    assert.deepEqual(seen, ['Ada']);
    const m = await make('noema-text-field', el => {
      el.label = 'About';
      el.multiline = true;
    });
    assert.equal($<HTMLLabelElement>(m, 'label').htmlFor, $(m, 'textarea').id);
  });
  test('a select, a switch (role switch) and a radio group (arrows move and choose)', async () => {
    const s = await make('noema-select', el => {
      el.label = 'Goal';
      el.options = [
        { value: '60', label: '60' },
        { value: '120', label: '120' },
      ];
      el.value = '120';
    });
    assert.equal($<HTMLSelectElement>(s, 'select').value, '120');
    assert.equal($<HTMLLabelElement>(s, 'label').htmlFor, $(s, 'select').id);
    const w = await make('noema-switch', el => {
      el.label = 'Sound';
    });
    const sw = $(w, '[role="switch"]');
    assert.equal(sw.getAttribute('aria-checked'), 'false');
    assert.equal($<HTMLLabelElement>(w, 'label').htmlFor, sw.id);
    sw.click();
    await w.updateComplete;
    assert.equal(sw.getAttribute('aria-checked'), 'true');
    const r = await make('noema-radio-group', el => {
      el.label = 'How much game';
      el.options = [
        { value: 'playful', label: 'Playful' },
        { value: 'calm', label: 'Calm', disabled: true },
        { value: 'off', label: 'Off' },
      ];
      el.value = 'playful';
    });
    const group = $(r, '[role="radiogroup"]');
    assert.equal(group.getAttribute('aria-labelledby'), $(r, '.lab').id);
    const radios = (): HTMLElement[] => [...(r.shadowRoot?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    assert.deepEqual(
      radios().map(x => x.tabIndex),
      [0, -1, -1],
    );
    key(radios()[0] as Element, 'ArrowDown');
    await settle(r);
    assert.equal(r.value, 'off', 'the disabled option is skipped');
    assert.equal(deepActiveElement(), radios()[2]);
    assert.equal(radios()[2]?.getAttribute('aria-checked'), 'true');
  });
});
