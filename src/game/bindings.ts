// ── Player-defined controls ──────────────────────────────────────────────────
// Every button used to fight is rebindable and persisted to localStorage.

export type ActionId =
  | 'left'
  | 'right'
  | 'guard'
  | 'dash'
  | 'jab'
  | 'slash'
  | 'throw'
  | 'cancel'
  | 'feign'
  | 'swap'
  | 'pause';

export interface BindingDef {
  id: ActionId;
  label: string;
  hint: string;
  group: 'MOVEMENT' | 'OFFENSE' | 'ENTROPY' | 'SYSTEM';
  def: string;
  /** held down (movement/guard) rather than tapped */
  hold: boolean;
  color: string;
}

export const BINDING_DEFS: BindingDef[] = [
  { id: 'left', label: 'STEP BACK', hint: 'create space · slip the rhythm', group: 'MOVEMENT', def: 'KeyA', hold: true, color: '#94a3b8' },
  { id: 'right', label: 'STEP FORWARD', hint: 'close the gap', group: 'MOVEMENT', def: 'KeyD', hold: true, color: '#94a3b8' },
  { id: 'guard', label: 'GUARD', hint: 'hold to block strikes', group: 'MOVEMENT', def: 'KeyS', hold: true, color: '#4ade80' },
  { id: 'dash', label: 'DASH', hint: 'gap closer · brief i-frames', group: 'MOVEMENT', def: 'Space', hold: false, color: '#facc15' },
  { id: 'jab', label: 'JAB', hint: 'fast strike · cheap commit', group: 'OFFENSE', def: 'KeyJ', hold: false, color: '#67e8f9' },
  { id: 'slash', label: 'SLASH', hint: 'heavy · long reach · slow', group: 'OFFENSE', def: 'KeyK', hold: false, color: '#a78bfa' },
  { id: 'throw', label: 'THROW', hint: 'beats guard · short range', group: 'OFFENSE', def: 'KeyL', hold: false, color: '#fb923c' },
  { id: 'cancel', label: 'LATE CANCEL', hint: 'spend entropy: erase recovery', group: 'ENTROPY', def: 'KeyQ', hold: false, color: '#f0abfc' },
  { id: 'feign', label: 'FAKE RECOVERY', hint: 'spend entropy: bait a whiff', group: 'ENTROPY', def: 'KeyE', hold: false, color: '#a3e635' },
  { id: 'swap', label: 'STANCE SWAP', hint: 'spend entropy: jam the model', group: 'ENTROPY', def: 'KeyR', hold: false, color: '#38bdf8' },
  { id: 'pause', label: 'PAUSE', hint: 'freeze the round', group: 'SYSTEM', def: 'Escape', hold: false, color: '#e2e8f0' },
];

export type Bindings = Record<ActionId, string>;
export type KeyLabels = Record<ActionId, string>;

export const DEFAULT_BINDINGS: Bindings = Object.fromEntries(
  BINDING_DEFS.map((d) => [d.id, d.def]),
) as Bindings;

const STORE_KEY = 'oracle-breaker.bindings.v1';

function sanitize(raw: unknown): Bindings {
  const out: Bindings = { ...DEFAULT_BINDINGS };
  if (!raw || typeof raw !== 'object') return out;
  const rec = raw as Record<string, unknown>;
  for (const d of BINDING_DEFS) {
    const v = rec[d.id];
    if (typeof v === 'string' && v.length <= 24) out[d.id] = v;
  }
  return out;
}

export function loadBindings(): Bindings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function saveBindings(b: Bindings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(b));
  } catch {
    /* private mode — bindings just won't persist */
  }
}

export function actionFor(b: Bindings, code: string): ActionId | null {
  for (const d of BINDING_DEFS) if (b[d.id] === code) return d.id;
  return null;
}

export function keyLabel(code: string): string {
  if (!code) return '—';
  const fixed: Record<string, string> = {
    Space: 'SPACE',
    Escape: 'ESC',
    Enter: 'ENTER',
    NumpadEnter: 'NUM↵',
    Backspace: 'BKSP',
    Tab: 'TAB',
    CapsLock: 'CAPS',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ShiftLeft: 'LSHIFT',
    ShiftRight: 'RSHIFT',
    ControlLeft: 'LCTRL',
    ControlRight: 'RCTRL',
    AltLeft: 'LALT',
    AltRight: 'RALT',
    Semicolon: ';',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
  };
  if (fixed[code]) return fixed[code];
  if (/^Key([A-Z])$/.test(code)) return code.slice(3);
  if (/^Digit(\d)$/.test(code)) return code.slice(5);
  if (/^Numpad(\d)$/.test(code)) return 'NUM' + code.slice(6);
  if (/^Numpad(Add|Subtract|Multiply|Divide)$/.test(code)) {
    return 'NUM' + code.slice(6).replace('Add', '+').replace('Subtract', '-').replace('Multiply', '*').replace('Divide', '/');
  }
  return code.replace(/(Left|Right)$/, '').slice(0, 7).toUpperCase();
}

export function labelsOf(b: Bindings): KeyLabels {
  return Object.fromEntries(BINDING_DEFS.map((d) => [d.id, keyLabel(b[d.id])])) as KeyLabels;
}

export interface Preset {
  name: string;
  blurb: string;
  bindings: Bindings;
}

export const PRESETS: Preset[] = [
  {
    name: 'DEFAULT',
    blurb: 'WASD move · J K L attack',
    bindings: { ...DEFAULT_BINDINGS },
  },
  {
    name: 'ARROWS',
    blurb: 'arrows move · Z X C attack',
    bindings: {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      guard: 'ArrowDown',
      dash: 'Space',
      jab: 'KeyZ',
      slash: 'KeyX',
      throw: 'KeyC',
      cancel: 'KeyQ',
      feign: 'KeyE',
      swap: 'KeyR',
      pause: 'Escape',
    },
  },
  {
    name: 'NUMPAD',
    blurb: 'arrows move · numpad attack',
    bindings: {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      guard: 'ArrowDown',
      dash: 'Numpad0',
      jab: 'Numpad1',
      slash: 'Numpad2',
      throw: 'Numpad3',
      cancel: 'Numpad4',
      feign: 'Numpad5',
      swap: 'Numpad6',
      pause: 'Numpad7',
    },
  },
  {
    name: 'LEFT-HAND',
    blurb: 'arrows move · right hand free',
    bindings: {
      left: 'KeyA',
      right: 'KeyD',
      guard: 'KeyS',
      dash: 'KeyW',
      jab: 'ArrowRight',
      slash: 'ArrowUp',
      throw: 'ArrowLeft',
      cancel: 'ShiftLeft',
      feign: 'ControlLeft',
      swap: 'AltLeft',
      pause: 'Escape',
    },
  },
];
