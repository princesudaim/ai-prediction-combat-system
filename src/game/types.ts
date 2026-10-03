// ── Oracle Breaker: shared types & frame data ────────────────────────────────

/** Everything the Oracle's model can predict about you. */
export type Token =
  | 'jab'
  | 'slash'
  | 'throw'
  | 'dash'
  | 'guard'
  | 'advance'
  | 'retreat'
  | 'idle';

export const TOKENS: Token[] = [
  'jab',
  'slash',
  'throw',
  'dash',
  'guard',
  'advance',
  'retreat',
  'idle',
];

export const TOKEN_META: Record<
  Token,
  { label: string; glyph: string; color: string; hint: string }
> = {
  jab: { label: 'JAB', glyph: '⚡', color: '#67e8f9', hint: 'fast strike' },
  slash: { label: 'SLASH', glyph: '✦', color: '#a78bfa', hint: 'heavy strike' },
  throw: { label: 'THROW', glyph: '◎', color: '#fb923c', hint: 'beats guard' },
  dash: { label: 'DASH', glyph: '»', color: '#facc15', hint: 'gap closer' },
  guard: { label: 'GUARD', glyph: '⬢', color: '#4ade80', hint: 'blocks strikes' },
  advance: { label: 'ADVANCE', glyph: '→', color: '#94a3b8', hint: 'step in' },
  retreat: { label: 'RETREAT', glyph: '←', color: '#94a3b8', hint: 'step out' },
  idle: { label: 'IDLE', glyph: '·', color: '#64748b', hint: 'waiting' },
};

export type Stance = 'orbit' | 'crash';

export interface StanceDef {
  id: Stance;
  label: string;
  speed: number; // walk speed multiplier
  damage: number;
  startup: number;
  recovery: number;
  range: number;
  color: string;
  accent: string;
  blurb: string;
}

export const STANCES: Record<Stance, StanceDef> = {
  orbit: {
    id: 'orbit',
    label: 'ORBIT',
    speed: 1.35,
    damage: 0.82,
    startup: 0.72,
    recovery: 0.8,
    range: 0.95,
    color: '#22d3ee',
    accent: '#a5f3fc',
    blurb: 'fast · light · slippery',
  },
  crash: {
    id: 'crash',
    label: 'CRASH',
    speed: 0.75,
    damage: 1.5,
    startup: 1.4,
    recovery: 1.3,
    range: 1.15,
    color: '#f43f5e',
    accent: '#fda4af',
    blurb: 'slow · heavy · long reach',
  },
};

export type AttackId = 'jab' | 'slash' | 'throw';

export interface AttackDef {
  id: AttackId;
  label: string;
  startup: number;
  active: number;
  recovery: number;
  range: number;
  damage: number;
  pushback: number;
  kind: 'strike' | 'throw' | 'heavy';
}

export const ATTACKS: Record<AttackId, AttackDef> = {
  jab: {
    id: 'jab',
    label: 'JAB',
    startup: 0.09,
    active: 0.06,
    recovery: 0.2,
    range: 82,
    damage: 7,
    pushback: 26,
    kind: 'strike',
  },
  slash: {
    id: 'slash',
    label: 'SLASH',
    startup: 0.25,
    active: 0.09,
    recovery: 0.42,
    range: 112,
    damage: 17,
    pushback: 62,
    kind: 'heavy',
  },
  throw: {
    id: 'throw',
    label: 'THROW',
    startup: 0.17,
    active: 0.11,
    recovery: 0.5,
    range: 58,
    damage: 13,
    pushback: 40,
    kind: 'throw',
  },
};

export type CounterType = 'parry' | 'hopslash' | 'grab' | 'sweep' | 'poke';

export const COUNTER_META: Record<
  CounterType,
  { label: string; verb: string; color: string; beats: string }
> = {
  parry: { label: 'PARRY', verb: 'deflect', color: '#fbbf24', beats: 'strikes' },
  hopslash: { label: 'HOP-CUT', verb: 'evade', color: '#34d399', beats: 'throws' },
  grab: { label: 'GRAB', verb: 'unseat', color: '#f472b6', beats: 'guard' },
  sweep: { label: 'SWEEP', verb: 'intercept', color: '#818cf8', beats: 'dashes' },
  poke: { label: 'POKE', verb: 'punish', color: '#fb7185', beats: 'hesitation' },
};

/** Which counter the Oracle reaches for, given what it thinks you'll do. */
export const COUNTER_FOR: Record<Token, CounterType> = {
  jab: 'parry',
  slash: 'parry',
  throw: 'hopslash',
  guard: 'grab',
  dash: 'sweep',
  advance: 'poke',
  retreat: 'poke',
  idle: 'poke',
};

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: 'spark' | 'ring' | 'shard';
}

export interface Callout {
  id: number;
  text: string;
  sub: string;
  kind: 'read' | 'break' | 'bait' | 'scramble' | 'info' | 'hit';
  life: number;
  maxLife: number;
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'read' | 'break' | 'bait' | 'scramble' | 'info' | 'hit';
}
