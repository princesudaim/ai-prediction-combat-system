// ── Oracle Breaker simulation ────────────────────────────────────────────────

import { Predictor, PredictedAction } from './predictor';
import {
  ATTACKS,
  AttackId,
  Callout,
  COUNTER_FOR,
  COUNTER_META,
  CounterType,
  FloatText,
  LogEntry,
  Particle,
  STANCES,
  Stance,
  TOKEN_META,
  Token,
} from './types';

export const ARENA = { w: 960, h: 380, ground: 300, left: 48, right: 912 };

export const COST = { cancel: 26, feign: 30, swap: 20 };

type PState = 'idle' | 'startup' | 'active' | 'recovery' | 'dash' | 'guard' | 'stun' | 'feign';
type AState =
  | 'idle'
  | 'walk'
  | 'windup'
  | 'active'
  | 'recovery'
  | 'hop'
  | 'parry'
  | 'stun'
  | 'broken'
  | 'strike'
  | 'recalibrate';

interface AiAttack {
  id: string;
  label: string;
  windup: number;
  active: number;
  recover: number;
  range: number;
  damage: number;
  kind: 'strike' | 'throw';
}

const AI_ATTACKS: Record<string, AiAttack> = {
  poke: { id: 'poke', label: 'POKE', windup: 0.3, active: 0.08, recover: 0.38, range: 98, damage: 9, kind: 'strike' },
  heavy: { id: 'heavy', label: 'RIFT CUT', windup: 0.54, active: 0.1, recover: 0.6, range: 130, damage: 17, kind: 'strike' },
  grab: { id: 'grab', label: 'GRAB', windup: 0.38, active: 0.12, recover: 0.62, range: 68, damage: 15, kind: 'throw' },
  punish: { id: 'punish', label: 'EXECUTE', windup: 0.17, active: 0.09, recover: 0.46, range: 108, damage: 21, kind: 'strike' },
  hopcut: { id: 'hopcut', label: 'HOP-CUT', windup: 0.12, active: 0.1, recover: 0.42, range: 112, damage: 13, kind: 'strike' },
};

interface Plan {
  target: Token;
  counter: CounterType;
  expectedIn: number;
  launched: boolean;
  window: number;
}

export interface Snapshot {
  phase: 'fight' | 'roundEnd' | 'matchEnd';
  round: number;
  wins: number;
  losses: number;
  clock: number;
  roundTime: number;
  playerHp: number;
  aiHp: number;
  entropy: number;
  entropyRegen: number;
  stance: Stance;
  scramble: number;
  confidence: number;
  horizon: number;
  chain: { token: Token; at: number; prob: number; depth: number; inSec: number }[];
  plan: { target: Token; counter: CounterType; expectedIn: number; launched: boolean } | null;
  aiState: AState;
  aiLabel: string;
  playerState: PState;
  combo: number;
  canCancel: boolean;
  canFeign: boolean;
  canSwap: boolean;
  reads: number;
  breaks: number;
  baits: number;
  samples: number;
  trace: { token: Token; p: number }[];
  ctx: Token[];
  callouts: Callout[];
  log: LogEntry[];
  roundResult: string | null;
  matchResult: string | null;
  damageDealt: number;
  bestCombo: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const createPlayer = () => ({
  x: 300,
  hp: 100,
  facing: 1 as 1 | -1,
  state: 'idle' as PState,
  timer: 0,
  atk: null as AttackId | null,
  unreadable: 0,
  stance: 'orbit' as Stance,
  guardHold: false,
  feignArmed: false,
  feignFlash: 0,
  whiffed: false,
  dashInvuln: 0,
  dashDir: 1,
  hitFlash: 0,
  entropy: 45,
  idleT: 0,
  startupDur: 0,
  activeDur: 0,
  recoveryDur: 0,
  bonusDmg: 1,
  trail: [] as { x: number; a: number }[],
});

const createAi = () => ({
  x: 660,
  hp: 100,
  facing: -1 as 1 | -1,
  state: 'idle' as AState,
  timer: 0,
  atk: null as AiAttack | null,
  label: '',
  phase: 'windup' as 'windup' | 'active' | 'recovery',
  hopVx: 0,
  after: null as string | null,
  attackTimer: 1.6,
  spacing: 168,
  trail: [] as { x: number; a: number }[],
});

export class Engine {
  clock = 0;
  roundTime = 60;
  round = 1;
  wins = 0;
  losses = 0;
  phase: 'fight' | 'roundEnd' | 'matchEnd' = 'fight';
  phaseTimer = 0;
  roundResult: string | null = null;
  matchResult: string | null = null;

  predictor = new Predictor();
  confidence = 0.2;
  horizon = 1;
  chain: (PredictedAction & { at: number })[] = [];
  plan: Plan | null = null;
  planCooldown = 0;
  commitThreshold = 0.42;
  launchLead = 0.16;
  predRefresh = 0;

  player = createPlayer();
  ai = createAi();

  input = { left: false, right: false, guard: false };

  particles: Particle[] = [];
  floats: FloatText[] = [];
  callouts: Callout[] = [];
  log: LogEntry[] = [];
  shake = 0;
  freeze = 0;
  flash = 0;
  flashColor = '#fff';

  stats = { reads: 0, breaks: 0, baits: 0, damage: 0, combo: 0, bestCombo: 0, comboT: 0 };
  private uid = 1;

  // ── lifecycle ────────────────────────────────────────────────────────────
  newMatch() {
    this.clock = 0;
    this.roundTime = 60;
    this.phase = 'fight';
    this.phaseTimer = 0;
    this.roundResult = null;
    this.predictor.fullReset();
    this.confidence = 0.2;
    this.horizon = 1;
    this.chain = [];
    this.plan = null;
    this.planCooldown = 0;
    this.commitThreshold = 0.42;
    this.predRefresh = 0;
    this.round = 1;
    this.wins = 0;
    this.losses = 0;
    this.matchResult = null;
    this.player = createPlayer();
    this.ai = createAi();
    this.input = { left: false, right: false, guard: false };
    this.shake = 0;
    this.freeze = 0;
    this.flash = 0;
    this.flashColor = '#fff';
    this.uid = 1;
    this.stats = { reads: 0, breaks: 0, baits: 0, damage: 0, combo: 0, bestCombo: 0, comboT: 0 };
    this.log = [];
    this.particles = [];
    this.floats = [];
    this.callouts = [];
    this.pushLog('ORACLE ONLINE — pattern buffer empty', 'info');
    this.startRound();
  }

  startRound() {
    this.player.hp = 100;
    this.ai.hp = 100;
    this.player.x = 300;
    this.ai.x = 660;
    this.player.state = 'idle';
    this.player.atk = null;
    this.player.trail = [];
    this.player.entropy = clamp(this.player.entropy + 15, 25, 100);
    this.ai.state = 'idle';
    this.ai.atk = null;
    this.ai.trail = [];
    this.ai.attackTimer = 1.5;
    this.roundTime = 60;
    this.plan = null;
    this.planCooldown = 0.6;
    this.chain = [];
    this.phase = 'fight';
    this.roundResult = null;
    this.particles = [];
    this.floats = [];
    this.callouts = [];
    this.predictor.resetRound();
    this.refreshPrediction(true);
    this.callout(`ROUND ${this.round}`, 'the oracle remembers everything', 'info', 1.5);
    this.pushLog(`round ${this.round} start · ${this.predictor.samples} samples in memory`, 'info');
  }

  // ── input ────────────────────────────────────────────────────────────────
  press(btn: string) {
    if (this.phase !== 'fight') return;
    const p = this.player;
    if (btn === 'left' || btn === 'right' || btn === 'guard') return;
    if (btn === 'swap') {
      this.stanceSwap();
      return;
    }
    if (btn === 'feign') {
      this.fakeRecovery();
      return;
    }
    if (btn === 'cancel') {
      this.lateCancel();
      return;
    }
    if (btn === 'dash') {
      if (p.state === 'idle' || p.state === 'guard') {
        const back = this.input.left && p.facing > 0 ? true : this.input.right && p.facing < 0;
        p.state = 'dash';
        p.timer = 0.24;
        p.dashInvuln = 0.11;
        p.dashDir = back ? -p.facing : p.facing;
        p.guardHold = false;
        this.emit('dash');
      }
      return;
    }
    if (btn === 'jab' || btn === 'slash' || btn === 'throw') {
      if (p.state === 'idle' || p.state === 'guard' || p.state === 'feign') {
        this.startAttack(btn, 1);
      }
    }
  }

  canAct(): boolean {
    return this.player.state === 'idle' || this.player.state === 'guard';
  }

  // ── player actions ───────────────────────────────────────────────────────
  startAttack(id: AttackId, dmgMul = 1, fast = false, unreadable = false) {
    const p = this.player;
    const st = STANCES[p.stance];
    const def = ATTACKS[id];
    p.state = 'startup';
    p.atk = id;
    p.startupDur = def.startup * st.startup * (fast ? 0.55 : 1);
    p.activeDur = def.active;
    p.recoveryDur = def.recovery * st.recovery * (fast ? 0.7 : 1);
    p.timer = p.startupDur;
    p.bonusDmg = dmgMul;
    p.guardHold = false;
    if (unreadable) p.unreadable = 0.9;
    this.emit(id, unreadable);
  }

  lateCancel() {
    const p = this.player;
    if (p.entropy < COST.cancel) {
      this.callout('NO ENTROPY', 'play readable to build chaos', 'info', 0.7);
      return;
    }
    if (p.state !== 'recovery' && p.state !== 'startup') return;
    p.entropy -= COST.cancel;
    p.state = 'idle';
    p.atk = null;
    this.startAttack('jab', 1.45, true, true);
    this.pushLog('LATE CANCEL — recovery erased', 'scramble');
    this.spawnRing(p.x, ARENA.ground - 46, '#f0abfc', 1);
  }

  fakeRecovery() {
    const p = this.player;
    if (p.entropy < COST.feign) {
      this.callout('NO ENTROPY', 'play readable to build chaos', 'info', 0.7);
      return;
    }
    if (p.state === 'stun' || p.state === 'dash') return;
    if (p.state === 'feign') return;
    p.entropy -= COST.feign;
    p.state = 'feign';
    p.timer = 0.85;
    p.atk = null;
    p.feignArmed = true;
    p.feignFlash = 0.85;
    this.pushLog('FAKE RECOVERY — you look hurt', 'scramble');
  }

  stanceSwap() {
    const p = this.player;
    if (p.entropy < COST.swap) {
      this.callout('NO ENTROPY', 'play readable to build chaos', 'info', 0.7);
      return;
    }
    p.entropy -= COST.swap;
    p.stance = p.stance === 'orbit' ? 'crash' : 'orbit';
    p.state = 'idle';
    p.atk = null;
    p.unreadable = 0.55;
    this.predictor.scramble = 3.6;
    this.predictor.trust = Math.max(0.07, this.predictor.trust - 0.14);
    if (this.plan) {
      this.plan = null;
      this.planCooldown = 0.6;
      this.ai.state = 'recalibrate';
      this.ai.timer = 0.42;
      this.callout('SIGNAL LOST', 'stance swap scrambled the model', 'scramble', 1.3);
      this.pushLog('SIGNAL LOST — stance swap', 'scramble');
    } else {
      this.callout('STANCE SWAP', STANCES[p.stance].label + ' — model scrambled', 'scramble', 1);
    }
    this.spawnRing(p.x, ARENA.ground - 46, STANCES[p.stance].color, 1);
    this.refreshPrediction(true);
  }

  // ── oracle prediction bookkeeping ────────────────────────────────────────
  emit(token: Token, unreadable = false) {
    const predicted = this.chain.length ? this.chain[0].token : null;
    this.predictor.observe(token, this.clock);
    this.predictor.feedback(token, predicted);
    this.resolvePlanOnAction(token, unreadable);
    this.player.idleT = 0;
    this.refreshPrediction(true);
  }

  refreshPrediction(force = false) {
    this.confidence = this.predictor.confidence();
    this.horizon = this.predictor.horizon(this.confidence);
    if (force || this.predRefresh <= 0) {
      this.chain = this.predictor.chain(this.confidence, this.clock);
      this.predRefresh = 0.1;
    }
  }

  resolvePlanOnAction(token: Token, unreadable: boolean) {
    const plan = this.plan;
    if (!plan) return;
    const committal = token !== 'advance' && token !== 'retreat';
    if (unreadable) {
      this.breakPlan(token === 'idle' ? 'whiff' : 'deviation');
      return;
    }
    if (token === plan.target) {
      this.resolveRead();
    } else if (committal) {
      this.breakPlan('deviation');
    } else {
      this.softBreak();
    }
  }

  resolveRead() {
    const plan = this.plan!;
    const counter = plan.counter;
    const p = this.player;
    this.plan = null;
    this.planCooldown = 0.55;
    this.stats.reads++;
    p.entropy = clamp(p.entropy + 7, 0, 100);
    this.predictor.trust = Math.min(0.96, this.predictor.trust + 0.025);
    const meta = COUNTER_META[counter];
    this.callout('READ', `${meta.label} — it called your ${TOKEN_META[plan.target].label}`, 'read', 1.1);
    this.pushLog(`READ · ${meta.label} beat ${TOKEN_META[plan.target].label}`, 'read');
    this.freeze = 0.07;
    this.shake = 9;
    this.flash = 0.16;
    this.flashColor = '#f59e0b';
    // the oracle snaps into place and punishes
    this.ai.x = clamp(p.x - p.facing * 78, ARENA.left, ARENA.right);
    this.ai.state = 'strike';
    this.ai.timer = 0.36;
    this.ai.label = meta.label;
    const dmgTable: Record<CounterType, number> = {
      parry: 11,
      hopslash: 13,
      grab: 16,
      sweep: 13,
      poke: 8,
    };
    const stunTable: Record<CounterType, number> = {
      parry: 0.6,
      hopslash: 0.5,
      grab: 0.55,
      sweep: 0.5,
      poke: 0.42,
    };
    this.damagePlayer(dmgTable[counter], stunTable[counter]);
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        x: p.x + p.facing * 26,
        y: ARENA.ground - 46 - Math.random() * 40,
        vx: -p.facing * (60 + Math.random() * 220),
        vy: (Math.random() - 0.5) * 200,
        life: 0.5,
        maxLife: 0.5,
        color: '#fbbf24',
        size: 2 + Math.random() * 3,
        kind: 'spark',
      });
    }
  }

  breakPlan(reason: 'deviation' | 'whiff') {
    this.plan = null;
    this.planCooldown = 0.75;
    this.predictor.trust = Math.max(0.07, this.predictor.trust - 0.07);
    this.stats.breaks++;
    this.player.entropy = clamp(this.player.entropy + 11, 0, 100);
    this.ai.state = 'broken';
    this.ai.timer = 0.95;
    this.ai.atk = null;
    this.ai.label = 'BROKEN';
    this.callout(
      'PREDICTION BROKEN',
      reason === 'whiff' ? 'the oracle whiffed its read' : 'you deviated',
      'break',
      1.4,
    );
    this.pushLog('BROKEN · oracle whiffed its read', 'break');
    this.freeze = 0.11;
    this.shake = 16;
    this.flash = 0.2;
    this.flashColor = '#22d3ee';
    this.spawnRing(this.ai.x, ARENA.ground - 46, '#22d3ee', 1.6);
    for (let i = 0; i < 22; i++) {
      this.particles.push({
        x: this.ai.x,
        y: ARENA.ground - 46 - Math.random() * 60,
        vx: (Math.random() - 0.5) * 420,
        vy: (Math.random() - 0.7) * 300,
        life: 0.7,
        maxLife: 0.7,
        color: Math.random() < 0.5 ? '#22d3ee' : '#a5f3fc',
        size: 2 + Math.random() * 4,
        kind: 'shard',
      });
    }
  }

  softBreak() {
    if (!this.plan) return;
    this.plan = null;
    this.planCooldown = 0.32;
    this.predictor.trust = Math.max(0.07, this.predictor.trust - 0.035);
    this.ai.state = 'recalibrate';
    this.ai.timer = 0.22;
    this.ai.label = 'RECALC';
    this.callout('SHIFTED', 'timing slipped — read cancelled', 'info', 0.65);
  }

  // ── damage ───────────────────────────────────────────────────────────────
  damagePlayer(dmg: number, stun: number) {
    const p = this.player;
    p.hp = Math.max(0, p.hp - dmg);
    p.state = 'stun';
    p.timer = stun;
    p.atk = null;
    p.guardHold = false;
    p.hitFlash = 0.25;
    this.stats.combo = 0;
    this.floats.push({
      x: p.x,
      y: ARENA.ground - 110,
      vy: -46,
      life: 0.9,
      maxLife: 0.9,
      text: `-${Math.round(dmg)}`,
      color: '#fca5a5',
      size: 26,
    });
    this.shake = Math.max(this.shake, 8);
    if (p.hp <= 0) this.endRound(false);
  }

  damageAi(dmg: number, color: string) {
    const a = this.ai;
    a.hp = Math.max(0, a.hp - dmg);
    this.stats.damage += dmg;
    this.stats.combo++;
    this.stats.comboT = 1.3;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.stats.combo);
    this.floats.push({
      x: a.x,
      y: ARENA.ground - 110,
      vy: -52,
      life: 0.95,
      maxLife: 0.95,
      text: `-${Math.round(dmg)}`,
      color,
      size: 28,
    });
    this.shake = Math.max(this.shake, 7);
    if (a.hp <= 0) this.endRound(true);
  }

  endRound(playerWon: boolean) {
    if (this.phase !== 'fight') return;
    this.phase = 'roundEnd';
    this.phaseTimer = 2.8;
    this.plan = null;
    if (playerWon) {
      this.wins++;
      this.roundResult = `ROUND ${this.round} — YOU`;
      this.callout('ROUND WON', 'the oracle must retrain', 'break', 2.4);
    } else {
      this.losses++;
      this.roundResult = `ROUND ${this.round} — ORACLE`;
      this.callout('ROUND LOST', 'it was always one step ahead', 'read', 2.4);
    }
    this.pushLog(
      `round ${this.round}: ${playerWon ? 'you' : 'oracle'} · model has ${this.predictor.samples} samples`,
      'info',
    );
    if (this.wins >= 2 || this.losses >= 2) {
      this.matchResult = this.wins >= 2 ? 'VICTORY' : 'DEFEAT';
    }
  }

  // ── main update ──────────────────────────────────────────────────────────
  update(dtRaw: number) {
    const dt = Math.min(0.05, dtRaw);
    this.clock += dt;
    this.predictor.tick(dt);
    this.decayFx(dt);

    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }

    if (this.phase === 'roundEnd') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.matchResult) {
          this.phase = 'matchEnd';
        } else {
          this.round++;
          this.startRound();
        }
      }
      return;
    }
    if (this.phase === 'matchEnd') return;

    this.roundTime = Math.max(0, this.roundTime - dt);
    if (this.roundTime <= 0) {
      this.endRound(this.player.hp >= this.ai.hp);
      return;
    }

    this.predRefresh -= dt;
    this.refreshPrediction();
    this.updateEntropy(dt);
    this.updatePlayer(dt);
    this.updateAi(dt);
    this.updatePlan(dt);
    if (this.stats.comboT > 0) {
      this.stats.comboT -= dt;
      if (this.stats.comboT <= 0) this.stats.combo = 0;
    }
  }

  updateEntropy(dt: number) {
    const regen = (this.confidence - 0.48) * 26;
    this.player.entropy = clamp(this.player.entropy + regen * dt, 0, 100);
  }

  updatePlayer(dt: number) {
    const p = this.player;
    const st = STANCES[p.stance];
    p.facing = this.ai.x >= p.x ? 1 : -1;
    if (p.unreadable > 0) p.unreadable -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (p.dashInvuln > 0) p.dashInvuln -= dt;
    if (p.feignFlash > 0) p.feignFlash -= dt;
    p.idleT += dt;
    // a held "doing nothing" is itself a readable pattern
    if (p.idleT > 0.75 && p.state === 'idle') {
      p.idleT = 0;
      this.emit('idle');
    }

    // trail
    p.trail.unshift({ x: p.x, a: 1 });
    if (p.trail.length > 10) p.trail.pop();
    for (const t of p.trail) t.a *= 0.86;

    switch (p.state) {
      case 'idle': {
        const dir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
        if (this.input.guard) {
          p.state = 'guard';
          this.emit('guard');
          break;
        }
        if (dir !== 0) p.x = clamp(p.x + dir * 215 * st.speed * dt, ARENA.left, ARENA.right);
        break;
      }
      case 'guard': {
        if (!this.input.guard) p.state = 'idle';
        break;
      }
      case 'startup': {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'active';
          p.timer = p.activeDur;
          this.resolvePlayerAttack();
        }
        break;
      }
      case 'active': {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'recovery';
          p.timer = p.recoveryDur;
        }
        break;
      }
      case 'recovery': {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'idle';
          p.atk = null;
        }
        break;
      }
      case 'dash': {
        p.timer -= dt;
        p.x = clamp(p.x + p.dashDir * 560 * dt, ARENA.left, ARENA.right);
        if (p.timer <= 0) p.state = 'idle';
        break;
      }
      case 'stun': {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'idle';
          p.feignArmed = false;
        }
        break;
      }
      case 'feign': {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = 'idle';
          p.feignArmed = false;
        }
        break;
      }
    }
  }

  resolvePlayerAttack() {
    const p = this.player;
    const a = this.ai;
    const def = ATTACKS[p.atk!];
    const st = STANCES[p.stance];
    const range = def.range * st.range;
    const dx = (a.x - p.x) * p.facing;
    const inRange = dx >= -26 && dx <= range;
    const hitX = p.x + p.facing * (inRange ? Math.min(dx * 0.8, range * 0.8) : range * 0.8);

    if (a.state === 'parry' && def.kind !== 'throw') {
      // deflected even without a formal plan (parry window still open)
      this.stats.reads++;
      this.ai.label = 'PARRY';
      this.ai.state = 'strike';
      this.ai.timer = 0.34;
      this.callout('READ', 'deflected mid-swing', 'read', 1);
      this.damagePlayer(10, 0.55);
      this.spawnRing(p.x + p.facing * 30, ARENA.ground - 50, '#fbbf24', 1.2);
      return;
    }
    if (!inRange) {
      p.whiffed = true;
      this.spawnWhiff(hitX);
      return;
    }
    p.whiffed = false;
    if (a.state === 'broken' || a.state === 'stun' || a.state === 'recalibrate') {
      const mul = 2.35 * p.bonusDmg;
      const dmg = def.damage * st.damage * mul;
      this.damageAi(dmg, '#fde047');
      a.state = 'stun';
      a.timer = 0.42;
      a.label = 'STUNNED';
      this.player.entropy = clamp(this.player.entropy + 4, 0, 100);
      this.callout(`BREAK HIT ${Math.round(dmg)}`, 'punish the whiff', 'break', 0.9);
      this.freeze = 0.1;
      this.shake = 14;
      this.flash = 0.14;
      this.flashColor = '#fde047';
      this.spawnBurst(hitX, '#fde047', 26);
      return;
    }
    const dmg = def.damage * st.damage * p.bonusDmg;
    const mul = p.unreadable > 0 ? 1.25 : 1;
    this.damageAi(dmg * mul, '#a5f3fc');
    a.x = clamp(a.x + p.facing * def.pushback, ARENA.left, ARENA.right);
    if (def.kind === 'throw') {
      a.state = 'stun';
      a.timer = 0.34;
      a.label = 'THROWN';
    }
    this.spawnBurst(hitX, def.kind === 'throw' ? '#fb923c' : STANCES[p.stance].accent, 14);
    this.freeze = 0.05;
  }

  // ── the oracle ───────────────────────────────────────────────────────────
  updateAi(dt: number) {
    const a = this.ai;
    const p = this.player;
    a.facing = p.x <= a.x ? -1 : 1;
    a.trail.unshift({ x: a.x, a: 1 });
    if (a.trail.length > 10) a.trail.pop();
    for (const t of a.trail) t.a *= 0.86;

    const dist = Math.abs(p.x - a.x);
    const neutral = a.state === 'idle' || a.state === 'walk';

    // adaptive read threshold: a losing oracle gambles more
    const resolved = this.stats.reads + this.stats.breaks;
    if (resolved > 8) {
      const rate = this.stats.reads / resolved;
      this.commitThreshold = rate < 0.36 ? 0.31 : rate > 0.62 ? 0.5 : 0.42;
    }

    if (neutral) {
      // spacing: confident oracle lurks just outside your reach, hungry one presses
      // its real defence is the read, not the spacing — it must be reachable
      const wantFar = 112 + 42 * this.confidence;
      const wantNear = 90;
      const playerCommitted =
        p.state === 'recovery' || p.state === 'stun' || p.state === 'feign';
      const target = playerCommitted ? wantNear : wantFar;
      const diff = dist - target;
      const speed = 118 + 42 * this.confidence;
      if (Math.abs(diff) > 14) {
        // diff > 0 → too far away → step toward the player
        const step = Math.sign(p.x - a.x) * (diff > 0 ? 1 : -1);
        a.x = clamp(a.x + step * speed * dt, ARENA.left, ARENA.right);
        a.state = 'walk';
      } else {
        a.state = 'idle';
      }

      // whiff punish: you're recovering and it's close enough
      a.attackTimer -= dt;
      const behind = (this.ai.hp < this.player.hp - 25) ? 0.55 : 1;
      if (p.whiffed && p.state === 'recovery' && p.timer > 0.16 && dist < 134 && !this.plan) {
        this.aiStartAttack('punish');
      } else if (a.attackTimer <= 0 && dist < 150 && !this.plan) {
        const r = Math.random();
        const aggression = 0.55 + 0.5 * this.confidence;
        if (r < 0.25 * aggression || p.state === 'feign') {
          const pick =
            p.state === 'guard' ? 'grab' : dist < 105 ? (r < 0.5 ? 'poke' : 'heavy') : 'heavy';
          this.aiStartAttack(pick);
        } else {
          a.attackTimer = (0.9 + Math.random() * 1.2) / behind;
        }
      }
      return;
    }

    switch (a.state) {
      case 'walk':
        a.state = 'idle';
        break;
      case 'windup':
        a.timer -= dt;
        if (a.timer <= 0) {
          a.state = 'active';
          a.timer = a.atk!.active;
          this.resolveAiAttack();
        }
        break;
      case 'active':
        a.timer -= dt;
        if (a.timer <= 0) {
          a.state = 'recovery';
          a.timer = a.atk!.recover;
        }
        break;
      case 'recovery':
        a.timer -= dt;
        if (a.timer <= 0) {
          a.state = 'idle';
          a.atk = null;
          a.label = '';
          a.attackTimer = (0.7 + Math.random() * 1.1) / (this.ai.hp < this.player.hp - 25 ? 0.6 : 1);
        }
        break;
      case 'hop':
        a.timer -= dt;
        a.x = clamp(a.x + a.hopVx * dt, ARENA.left, ARENA.right);
        if (a.timer <= 0) {
          if (a.after === 'hopcut') {
            a.after = null;
            this.aiStartAttack('hopcut', true);
          } else {
            a.state = 'idle';
          }
        }
        break;
      case 'parry':
      case 'stun':
      case 'broken':
      case 'strike':
      case 'recalibrate':
        a.timer -= dt;
        if (a.timer <= 0) {
          a.state = 'idle';
          a.atk = null;
          a.label = '';
        }
        break;
    }
  }

  aiStartAttack(id: string, instant = false) {
    const a = this.ai;
    const atk = AI_ATTACKS[id];
    a.atk = atk;
    a.label = atk.label;
    a.state = 'windup';
    a.timer = instant ? Math.min(atk.windup, 0.12) : atk.windup;
  }

  resolveAiAttack() {
    const a = this.ai;
    const p = this.player;
    const atk = a.atk!;
    const dx = (p.x - a.x) * a.facing;
    const inRange = dx >= -26 && dx <= atk.range;
    const hitX = a.x + a.facing * (inRange ? Math.min(dx * 0.8, atk.range * 0.7) : atk.range * 0.7);

    if (p.state === 'feign' && p.feignArmed) {
      // you baited the oracle into swinging at a "helpless" you
      p.feignArmed = false;
      p.state = 'idle';
      this.stats.baits++;
      this.stats.breaks++;
      p.entropy = clamp(p.entropy + 14, 0, 100);
      this.predictor.trust = Math.max(0.07, this.predictor.trust - 0.09);
      a.state = 'stun';
      a.timer = 1;
      a.label = 'BAITED';
      this.callout('BAITED', 'fake recovery → free punish', 'bait', 1.5);
      this.pushLog('BAITED · oracle swung into a feint', 'bait');
      this.freeze = 0.12;
      this.shake = 14;
      this.flash = 0.18;
      this.flashColor = '#a3e635';
      this.spawnRing(hitX, ARENA.ground - 52, '#a3e635', 1.5);
      return;
    }
    if (!inRange) {
      this.spawnWhiff(hitX);
      return;
    }
    if (p.dashInvuln > 0) {
      this.callout('PHASED', 'dashed through the strike', 'info', 0.7);
      this.spawnWhiff(hitX);
      return;
    }
    if (p.state === 'guard' && atk.kind !== 'throw') {
      const chip = atk.damage * 0.18;
      p.hp = Math.max(0, p.hp - chip);
      p.x = clamp(p.x + a.facing * 34, ARENA.left, ARENA.right);
      this.floats.push({
        x: p.x,
        y: ARENA.ground - 104,
        vy: -40,
        life: 0.7,
        maxLife: 0.7,
        text: 'BLOCK',
        color: '#86efac',
        size: 18,
      });
      this.spawnBurst(hitX, '#86efac', 8);
      this.shake = Math.max(this.shake, 4);
      if (p.hp <= 0) this.endRound(false);
      return;
    }
    this.damagePlayer(atk.damage, atk.kind === 'throw' ? 0.5 : 0.44);
    this.spawnBurst(hitX, '#fb7185', 16);
    this.freeze = 0.06;
  }

  updatePlan(dt: number) {
    if (this.planCooldown > 0) this.planCooldown -= dt;
    const a = this.ai;
    const neutral = a.state === 'idle' || a.state === 'walk';
    const dist = Math.abs(this.player.x - a.x);

    if (this.plan) {
      const pl = this.plan;
      pl.expectedIn -= dt;
      if (!pl.launched && pl.expectedIn <= this.launchLead) {
        pl.launched = true;
        this.launchCounter(pl.counter);
      }
      if (pl.expectedIn <= -pl.window) {
        if (pl.launched && a.state !== 'broken') this.breakPlan('whiff');
        else this.softBreak();
      }
      return;
    }
    if (!neutral || this.planCooldown > 0) return;
    if (!this.chain.length || this.confidence < this.commitThreshold) return;
    const c0 = this.chain[0];
    const lead = c0.at - this.clock;
    // commit only when the predicted action is imminent (and not already stale)
    if (lead > this.launchLead + 0.34 || lead < -0.18) return;
    if (dist > 330) return;
    this.plan = {
      target: c0.token,
      counter: COUNTER_FOR[c0.token],
      expectedIn: c0.at - this.clock,
      launched: false,
      window: 0.3,
    };
  }

  launchCounter(counter: CounterType) {
    const a = this.ai;
    switch (counter) {
      case 'parry':
        a.state = 'parry';
        a.timer = 0.55;
        a.label = 'PARRY';
        break;
      case 'hopslash':
        a.state = 'hop';
        a.timer = 0.22;
        a.hopVx = a.facing * -260;
        a.after = 'hopcut';
        a.label = 'HOP';
        break;
      case 'grab':
        this.aiStartAttack('grab');
        break;
      case 'sweep':
        this.aiStartAttack('heavy');
        break;
      case 'poke':
        this.aiStartAttack('poke');
        break;
    }
    this.spawnRing(a.x, ARENA.ground - 50, COUNTER_META[counter].color, 0.9);
  }

  // ── fx ───────────────────────────────────────────────────────────────────
  spawnBurst(x: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x,
        y: ARENA.ground - 52 - Math.random() * 34,
        vx: (Math.random() - 0.5) * 380,
        vy: (Math.random() - 0.6) * 260,
        life: 0.45,
        maxLife: 0.45,
        color,
        size: 2 + Math.random() * 3,
        kind: 'spark',
      });
    }
  }

  spawnWhiff(x: number) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x,
        y: ARENA.ground - 60 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 90,
        vy: -20 - Math.random() * 60,
        life: 0.4,
        maxLife: 0.4,
        color: '#64748b',
        size: 1.5 + Math.random() * 2,
        kind: 'spark',
      });
    }
  }

  spawnRing(x: number, y: number, color: string, scale: number) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.45 * scale,
      maxLife: 0.45 * scale,
      color,
      size: scale,
      kind: 'ring',
    });
  }

  decayFx(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 42);
    this.flash = Math.max(0, this.flash - dt);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.kind !== 'ring') q.vy += 620 * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    for (let i = this.callouts.length - 1; i >= 0; i--) {
      this.callouts[i].life -= dt;
      if (this.callouts[i].life <= 0) this.callouts.splice(i, 1);
    }
  }

  callout(text: string, sub: string, kind: Callout['kind'], dur = 1.1) {
    this.callouts.push({ id: this.uid++, text, sub, kind, life: dur, maxLife: dur });
    if (this.callouts.length > 3) this.callouts.shift();
  }

  pushLog(text: string, kind: LogEntry['kind']) {
    this.log.unshift({ id: this.uid++, text, kind });
    if (this.log.length > 26) this.log.pop();
  }

  // ── hud data ─────────────────────────────────────────────────────────────
  snapshot(): Snapshot {
    const trace = this.predictor.trace();
    const entries = Object.entries(trace.dist.dist)
      .map(([token, p]) => ({ token: token as Token, p }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 5);
    const p = this.player;
    return {
      phase: this.phase,
      round: this.round,
      wins: this.wins,
      losses: this.losses,
      clock: this.clock,
      roundTime: this.roundTime,
      playerHp: p.hp,
      aiHp: this.ai.hp,
      entropy: p.entropy,
      entropyRegen: (this.confidence - 0.48) * 26,
      stance: p.stance,
      scramble: this.predictor.scramble,
      confidence: this.confidence,
      horizon: this.horizon,
      chain: this.chain.map((c) => ({
        token: c.token,
        at: c.at,
        prob: c.prob,
        depth: c.depth,
        inSec: Math.max(0, c.at - this.clock),
      })),
      plan: this.plan
        ? {
            target: this.plan.target,
            counter: this.plan.counter,
            expectedIn: this.plan.expectedIn,
            launched: this.plan.launched,
          }
        : null,
      aiState: this.ai.state,
      aiLabel: this.ai.label,
      playerState: p.state,
      combo: this.stats.combo,
      canCancel:
        (p.state === 'recovery' || p.state === 'startup') && p.entropy >= COST.cancel,
      canFeign: p.state !== 'feign' && p.state !== 'stun' && p.entropy >= COST.feign,
      canSwap: p.entropy >= COST.swap,
      reads: this.stats.reads,
      breaks: this.stats.breaks,
      baits: this.stats.baits,
      samples: this.predictor.samples,
      trace: entries,
      ctx: trace.ctx,
      callouts: this.callouts.slice(-3),
      log: this.log.slice(0, 8),
      roundResult: this.roundResult,
      matchResult: this.matchResult,
      damageDealt: this.stats.damage,
      bestCombo: this.stats.bestCombo,
    };
  }
}
