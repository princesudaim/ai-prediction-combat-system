// ── The Oracle's mind ────────────────────────────────────────────────────────
// A weighted, recency-discounted n-gram (Markov) model over the player's input
// tokens, with Katz-style backoff from order 3 -> 1 -> global, plus a learned
// inter-action rhythm so it can predict *when* you will act, not just what.
// Confidence drives how far ahead the Oracle dares to look.

import { Token, TOKENS } from './types';

export interface Dist {
  dist: Record<Token, number>;
  total: number;
  top: Token;
  topProb: number;
  order: number;
}

export interface PredictedAction {
  token: Token;
  /** absolute fight-clock time at which the model expects this action */
  at: number;
  prob: number;
  depth: number;
}

const MAX_HISTORY = 240;
const ORDERS = [3, 2, 1];
const RHYTHM_ALPHA = 0.25;

export class Predictor {
  seq: Token[] = [];
  gaps: number[] = [];
  /** exponential moving average of model correctness (0..1) */
  trust = 0.28;
  samples = 0;
  /** > 0 while stance-swap noise is jamming the model */
  scramble = 0;
  private lastArrival = -1;
  private rhythm = 0.42;

  resetRound() {
    // Model memory persists across rounds — that's the whole point.
    this.lastArrival = -1;
  }

  fullReset() {
    this.seq = [];
    this.gaps = [];
    this.trust = 0.28;
    this.samples = 0;
    this.scramble = 0;
    this.lastArrival = -1;
    this.rhythm = 0.42;
  }

  observe(token: Token, now: number) {
    const gap =
      this.lastArrival < 0 ? this.rhythm : Math.min(2.2, Math.max(0.08, now - this.lastArrival));
    this.lastArrival = now;
    this.rhythm += RHYTHM_ALPHA * (gap - this.rhythm);
    this.seq.push(token);
    this.gaps.push(gap);
    this.samples++;
    if (this.seq.length > MAX_HISTORY) {
      this.seq.shift();
      this.gaps.shift();
    }
  }

  /** Weighted next-token distribution for an arbitrary context. */
  predict(ctx: Token[]): Dist {
    const n = this.seq.length;
    for (const order of ORDERS) {
      if (n < order + 2) continue;
      const key = ctx.slice(-order);
      const acc = blank();
      let total = 0;
      let weight = 0;
      for (let i = n - 1; i >= order - 1; i--) {
        // recency discount: recent behaviour counts ~2.4x more than old rounds
        const w = 0.42 + 0.58 * (i / Math.max(1, n - 1));
        weight += w;
        let match = true;
        for (let k = 0; k < order; k++) {
          if (this.seq[i - order + 1 + k] !== key[k]) {
            match = false;
            break;
          }
        }
        if (!match) continue;
        const next = this.seq[i + 1];
        acc[next] += w;
        total += w;
      }
      if (total >= 1.6) {
        const dist = blank();
        for (const t of TOKENS) dist[t] = acc[t] / total;
        return finalize(dist, total, order);
      }
    }
    // global fallback
    const dist = blank();
    const n2 = Math.min(n, MAX_HISTORY);
    for (let i = 0; i < n2; i++) {
      const w = 0.42 + 0.58 * (i / Math.max(1, n2 - 1));
      dist[this.seq[i]] += w;
    }
    let tot = 0;
    for (const t of TOKENS) tot += dist[t];
    if (tot > 0) for (const t of TOKENS) dist[t] /= tot;
    return finalize(dist, tot, 0);
  }

  /** Mean observed gap *after* a given token — your personal tempo. */
  gapAfter(token: Token): number {
    let sum = 0;
    let wsum = 0;
    const n = this.seq.length;
    for (let i = n - 2; i >= Math.max(0, n - 60); i--) {
      if (this.seq[i + 1] !== token) continue;
      const w = 0.4 + 0.6 * (i / Math.max(1, n - 1));
      sum += this.gaps[i + 1] * w;
      wsum += w;
    }
    if (wsum < 0.8) {
      // no data yet: sensible priors per token
      const prior: Record<Token, number> = {
        jab: 0.34,
        slash: 0.62,
        throw: 0.55,
        dash: 0.5,
        guard: 0.7,
        advance: 0.46,
        retreat: 0.44,
        idle: 0.8,
      };
      return 0.65 * prior[token] + 0.35 * this.rhythm;
    }
    return 0.5 * (sum / wsum) + 0.5 * this.rhythm;
  }

  /** 0..1. Blends the model's own certainty with its track record. */
  confidence(): number {
    if (this.samples < 4) return 0.16;
    const d = this.predict(this.context());
    const shrink = d.total / (d.total + 3.5);
    const stat = d.topProb * shrink;
    let c = 0.52 * stat + 0.48 * this.trust;
    if (this.scramble > 0) c *= 0.34;
    return Math.max(0.05, Math.min(0.97, c));
  }

  context(): Token[] {
    return this.seq.slice(-3);
  }

  /** How far ahead (seconds) the Oracle projects. 1.0s (blind) → 2.1s (locked on). */
  horizon(conf: number): number {
    return 0.95 + 1.15 * conf;
  }

  /**
   * Roll the model forward to produce a visible "prediction ghost" chain.
   * Times are anchored to your last observed input, so the countdown is a real
   * rhythm estimate rather than a constantly-receding "soon".
   */
  chain(conf: number, now: number): PredictedAction[] {
    const out: PredictedAction[] = [];
    const hz = this.horizon(conf);
    const anchor = this.lastArrival >= 0 ? this.lastArrival : now;
    let ctx = this.context();
    let t = anchor;
    for (let depth = 1; depth <= 3; depth++) {
      const d = this.predict(ctx);
      if (d.topProb <= 0) break;
      t += this.gapAfter(d.top);
      if (t - now > hz) break;
      out.push({ token: d.top, at: t, prob: d.topProb, depth });
      ctx = [...ctx, d.top];
      if (ctx.length > 3) ctx = ctx.slice(-3);
    }
    return out;
  }

  /** Called the moment you act. Feeds the trust EMA used for confidence. */
  feedback(actual: Token, predicted: Token | null) {
    if (!predicted) return;
    if (actual === predicted) this.trust = Math.min(0.96, this.trust + 0.075);
    else this.trust = Math.max(0.07, this.trust - 0.105);
  }

  tick(dt: number) {
    if (this.scramble > 0) this.scramble = Math.max(0, this.scramble - dt);
  }

  /** Top-N readout for the telemetry panel. */
  trace(): { dist: Dist; ctx: Token[] } {
    const ctx = this.context();
    return { dist: this.predict(ctx), ctx };
  }
}

function blank(): Record<Token, number> {
  const o = {} as Record<Token, number>;
  for (const t of TOKENS) o[t] = 0;
  return o;
}

function finalize(dist: Record<Token, number>, total: number, order: number): Dist {
  let top: Token = 'idle';
  let topProb = 0;
  for (const t of TOKENS) {
    if (dist[t] > topProb) {
      topProb = dist[t];
      top = t;
    }
  }
  return { dist, total, top, topProb, order };
}
