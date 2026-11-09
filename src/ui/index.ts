/**
 * The UI foundation of the new app (phase 3; docs/ARCHITECTURE.md §6.3): the component kit on the design tokens, the
 * typed hash router, the app frame and its overlay layer, the appearance (scheme, character, motion), all speaking
 * through the I18n port. Importing this module defines nothing: the root calls defineUi() once, so a page that never
 * shows the new UI pays nothing, and tests can define the elements in their own registry.
 */
import { NoemaAppFrame } from './frame/app-frame.ts';
import { NoemaLayer } from './frame/layer.ts';
import { NoemaButton, NoemaIconButton } from './kit/button.ts';
import { NoemaCard } from './kit/card.ts';
import { NoemaChip, NoemaChips } from './kit/chip.ts';
import { NoemaDialog } from './kit/dialog.ts';
import { NoemaRadioGroup, NoemaSelect, NoemaSwitch, NoemaTextField } from './kit/forms.ts';
import { NoemaIcon } from './kit/icons.ts';
import { NoemaLevelBadge } from './kit/level-badge.ts';
import { NoemaCollapsible, NoemaList, NoemaListItem } from './kit/list.ts';
import { NoemaMenu, NoemaMenuItem, NoemaMenuSeparator } from './kit/menu.ts';
import { NoemaProgress } from './kit/progress.ts';
import { NoemaTabs } from './kit/tabs.ts';
import { NoemaTip } from './kit/tip.ts';
import { NoemaToaster } from './kit/toaster.ts';

/** Every element of the kit and its tag (the one list). */
export const ELEMENTS = {
  'noema-app-frame': NoemaAppFrame,
  'noema-layer': NoemaLayer,
  'noema-button': NoemaButton,
  'noema-icon-button': NoemaIconButton,
  'noema-icon': NoemaIcon,
  'noema-card': NoemaCard,
  'noema-chip': NoemaChip,
  'noema-chips': NoemaChips,
  'noema-dialog': NoemaDialog,
  'noema-text-field': NoemaTextField,
  'noema-select': NoemaSelect,
  'noema-switch': NoemaSwitch,
  'noema-radio-group': NoemaRadioGroup,
  'noema-level-badge': NoemaLevelBadge,
  'noema-list': NoemaList,
  'noema-list-item': NoemaListItem,
  'noema-collapsible': NoemaCollapsible,
  'noema-menu': NoemaMenu,
  'noema-menu-item': NoemaMenuItem,
  'noema-menu-separator': NoemaMenuSeparator,
  'noema-progress': NoemaProgress,
  'noema-tabs': NoemaTabs,
  'noema-tip': NoemaTip,
  'noema-toaster': NoemaToaster,
} as const;

declare global {
  interface HTMLElementTagNameMap {
    'noema-app-frame': NoemaAppFrame;
    'noema-layer': NoemaLayer;
    'noema-button': NoemaButton;
    'noema-icon-button': NoemaIconButton;
    'noema-icon': NoemaIcon;
    'noema-card': NoemaCard;
    'noema-chip': NoemaChip;
    'noema-chips': NoemaChips;
    'noema-dialog': NoemaDialog;
    'noema-text-field': NoemaTextField;
    'noema-select': NoemaSelect;
    'noema-switch': NoemaSwitch;
    'noema-radio-group': NoemaRadioGroup;
    'noema-level-badge': NoemaLevelBadge;
    'noema-list': NoemaList;
    'noema-list-item': NoemaListItem;
    'noema-collapsible': NoemaCollapsible;
    'noema-menu': NoemaMenu;
    'noema-menu-item': NoemaMenuItem;
    'noema-menu-separator': NoemaMenuSeparator;
    'noema-progress': NoemaProgress;
    'noema-tabs': NoemaTabs;
    'noema-tip': NoemaTip;
    'noema-toaster': NoemaToaster;
  }
}

/** Defines every element of the kit (again: nothing happens). */
export function defineUi(registry: CustomElementRegistry = customElements): void {
  for (const [tag, ctor] of Object.entries(ELEMENTS)) if (!registry.get(tag)) registry.define(tag, ctor);
}

export { NoemaElement } from './core/element.ts';
export { provideServices, requestServices, type Locales, type LocaleInfo, type UiServices } from './core/services.ts';
export { applyAppearance, DEFAULT_APPEARANCE, isCharacter, type Appearance, type Motion, type Scheme } from './core/appearance.ts';
export { openOverlay, type Overlay } from './core/overlays.ts';
export { place } from './core/place.ts';
export { moveIndex, typeahead } from './core/keys.ts';
export { defineRoutes, type ParamsOf, type RouteMatch, type Routes } from './router/routes.ts';
export { browserHash, createRouter, memoryHash, type HashLocation, type Router } from './router/router.ts';
export { confirmDialog, type ConfirmOptions } from './frame/layer.ts';
export { WIDE_PX, type Crumb, type FrameTab } from './frame/app-frame.ts';
export { ICON_NAMES, icon, type IconName } from './kit/icons.ts';
export type { TabDef } from './kit/tabs.ts';
export type { FieldOption } from './kit/forms.ts';
export type { ToastKind, ShownToast } from './kit/toaster.ts';
export {
  NoemaAppFrame,
  NoemaLayer,
  NoemaButton,
  NoemaIconButton,
  NoemaIcon,
  NoemaCard,
  NoemaChip,
  NoemaChips,
  NoemaDialog,
  NoemaTextField,
  NoemaSelect,
  NoemaSwitch,
  NoemaRadioGroup,
  NoemaLevelBadge,
  NoemaList,
  NoemaListItem,
  NoemaCollapsible,
  NoemaMenu,
  NoemaMenuItem,
  NoemaMenuSeparator,
  NoemaProgress,
  NoemaTabs,
  NoemaTip,
  NoemaToaster,
};
