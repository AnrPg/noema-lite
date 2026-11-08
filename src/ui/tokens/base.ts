/* The base token set: the look of every screen before a character is applied, and the tokens the older rules of
   engine/src/*.css read (a character maps its palette onto them: BRIDGE in css.ts). */
import type { BaseTokens } from './types.ts';

export const BASE: BaseTokens = {
  colour: {
    light: {
      bg: '#fbf9f4',
      bg2: '#f3f0e8',
      card: '#ffffff',
      ink: '#1f2330',
      ink2: '#5b6172',
      ink3: '#9096a6',
      line: '#ebe7dd',
      ok: '#12a37a',
      okBg: '#e3f7ef',
      bad: '#e5484d',
      badBg: '#fde8e8',
      warn: '#f2a20c',
      warnBg: '#fff4dc',
      info: '#3b82f6',
      infoBg: '#e8f0fe',
      violet: '#7c5cff',
      violetBg: '#efebff',
      c: '#7c5cff',
      cBg: '#efebff',
      codeBg: '#1d2130',
      codeInk: '#e8eaf2',
    },
    dark: {
      bg: '#14161d',
      bg2: '#1b1e27',
      card: '#1f232e',
      ink: '#eef0f6',
      ink2: '#a9afc0',
      ink3: '#6f7689',
      line: '#2c3140',
      okBg: '#103a2f',
      badBg: '#43191c',
      warnBg: '#3d2f10',
      infoBg: '#172a4a',
      violetBg: '#2a2350',
      codeBg: '#11131a',
    },
  },
  typography: {
    font: "'Plus Jakarta Sans','Noto Sans Arabic','Noto Sans Hebrew','Noto Sans Devanagari',var(--noema-cjk,'Noto Sans SC'),ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
    mono: "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
    /** after a character's own faces: the scripts' self-hosted Noto fonts (fonts/scripts.css, docs/i18n.md §2), then the system's */
    system:
      '"Noto Sans Arabic","Noto Sans Hebrew","Noto Sans Devanagari",var(--noema-cjk,"Noto Sans SC"),ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  },
  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '28px', 7: '40px' },
  radius: { r: '18px', rSm: '12px' },
  shadow: {
    light: '0 1px 2px rgba(31,35,48,.05),0 8px 24px -12px rgba(31,35,48,.18)',
    dark: '0 1px 2px rgba(0,0,0,.3),0 10px 30px -14px rgba(0,0,0,.6)',
  },
  motion: { fast: '.15s', base: '.2s', slow: '.3s', view: '.45s', ease: 'cubic-bezier(.2,.8,.2,1)', spring: 'cubic-bezier(.2,.9,.3,1.2)' },
  z: { tabs: 30, bar: 31, sticky: 35, top: 40, fx: 45, drawer: 60, modal: 80, toast: 90, tip: 95, popover: 96, confetti: 99, overlay: 300 },
};
