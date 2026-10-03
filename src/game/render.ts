// ── Canvas renderer ──────────────────────────────────────────────────────────

import { ARENA, Engine } from './engine';
import { ATTACKS, COUNTER_META, STANCES, TOKEN_META, Token } from './types';

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
const DISPLAY = '"Chakra Petch", "Rajdhani", system-ui, sans-serif';

function ghostX(token: Token, baseX: number, facing: number) {
  switch (token) {
    case 'advance':
      return baseX + facing * 54;
    case 'retreat':
      return baseX - facing * 54;
    case 'dash':
      return baseX + facing * 152;
    case 'guard':
      return baseX - facing * 8;
    case 'idle':
      return baseX;
    default:
      return baseX + facing * 20;
  }
}

interface Pose {
  crouch: number;
  ext: number;
  lean: number;
  arc: number;
  charge: number;
  shield: number;
  wobble: number;
}

function poseFor(engine: Engine, who: 'player' | 'ai'): Pose {
  const t = engine.clock;
  const state = (who === 'player' ? engine.player.state : engine.ai.state) as string;
  const pose: Pose = { crouch: 0, ext: 0, lean: 0, arc: 0, charge: 0, shield: 0, wobble: 0 };
  if (who === 'player') {
    const p = engine.player;
    const atk = engine.player.atk;
    const def = atk ? ATTACKS[atk] : null;
    switch (state) {
      case 'idle':
        pose.wobble = Math.sin(t * 3) * 2;
        break;
      case 'guard':
        pose.crouch = 8;
        pose.shield = 1;
        break;
      case 'startup': {
        const k = 1 - p.timer / Math.max(0.001, p.startupDur);
        pose.charge = k;
        pose.ext = -0.25 * (1 - k);
        pose.lean = -0.1;
        break;
      }
      case 'active':
        pose.ext = 1;
        pose.arc = 1;
        pose.lean = 0.18;
        if (def && def.kind === 'heavy') pose.crouch = 4;
        break;
      case 'recovery': {
        const k = p.timer / Math.max(0.001, p.recoveryDur);
        pose.ext = 0.35 * k;
        pose.crouch = 6;
        pose.lean = 0.1;
        break;
      }
      case 'dash':
        pose.lean = 0.35;
        pose.ext = 0.5;
        break;
      case 'stun':
        pose.wobble = Math.sin(t * 26) * 7;
        pose.crouch = 10;
        pose.lean = -0.2;
        break;
      case 'feign':
        pose.wobble = Math.sin(t * 17) * 5;
        pose.crouch = 14;
        pose.lean = -0.12;
        break;
    }
  } else {
    const a = engine.ai;
    const atk = a.atk;
    switch (state) {
      case 'idle':
        pose.wobble = Math.sin(t * 2.4) * 2;
        break;
      case 'walk':
        pose.wobble = Math.sin(t * 12) * 3;
        break;
      case 'windup': {
        const total = Math.max(0.001, atk ? atk.windup : 0.3);
        pose.charge = 1 - a.timer / total;
        pose.ext = -0.3;
        break;
      }
      case 'active':
        pose.ext = 1;
        pose.arc = 1;
        pose.lean = 0.2;
        break;
      case 'recovery':
        pose.ext = 0.3;
        pose.crouch = 7;
        break;
      case 'hop':
        pose.crouch = -14;
        pose.lean = -0.3;
        break;
      case 'parry':
        pose.shield = 1.6;
        pose.crouch = 5;
        break;
      case 'strike':
        pose.ext = 1;
        pose.arc = 1.2;
        pose.lean = 0.3;
        break;
      case 'stun':
      case 'broken':
      case 'recalibrate':
        pose.wobble = Math.sin(t * (state === 'broken' ? 32 : 20)) * 8;
        pose.crouch = 12;
        pose.lean = -0.22;
        break;
    }
  }
  return pose;
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  facing: number,
  pose: Pose,
  color: string,
  accent: string,
  glow: number,
  alpha = 1,
  dashed = false,
) {
  const g = ARENA.ground;
  const y = g - pose.crouch + pose.wobble * 0.35;
  const H = 88;
  const hipY = y - H * 0.42;
  const shoulderY = y - H * 0.82;
  const headY = y - H * 0.95;
  const lean = pose.lean * facing;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (dashed) ctx.setLineDash([5, 5]);
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';

  // legs
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x - 11 + lean * 6, y);
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + 13 + lean * 8, y - 2);
  ctx.stroke();

  // torso
  ctx.beginPath();
  ctx.moveTo(x, hipY);
  ctx.lineTo(x + lean * 10, shoulderY);
  ctx.stroke();

  // head
  ctx.beginPath();
  ctx.arc(x + lean * 12, headY, 9.5, 0, Math.PI * 2);
  ctx.stroke();
  // visor
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x + lean * 12 + facing * 2, headY - 2.5);
  ctx.lineTo(x + lean * 12 + facing * 9, headY - 1.5);
  ctx.stroke();

  // arm / weapon
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.8;
  const reach = 18 + pose.ext * 46 + pose.charge * 6;
  ctx.beginPath();
  ctx.moveTo(x + lean * 10, shoulderY + 3);
  ctx.lineTo(x + lean * 10 + facing * reach, shoulderY + 1 + pose.arc * 6);
  ctx.stroke();

  if (pose.shield > 0) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = pose.shield > 1.2 ? '#fbbf24' : accent;
    ctx.shadowColor = ctx.strokeStyle as string;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + facing * 26, y - 46, 26 + pose.shield * 4, -1.15, 1.15);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawAttackFx(
  ctx: CanvasRenderingContext2D,
  x: number,
  facing: number,
  pose: Pose,
  color: string,
  range: number,
) {
  if (pose.arc <= 0) return;
  ctx.save();
  ctx.globalAlpha = 0.75 * pose.arc;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 26;
  ctx.lineWidth = 5;
  ctx.beginPath();
  const cy = ARENA.ground - 58;
  const r = range * 0.92;
  const sweep = 1.5 * pose.arc;
  ctx.arc(x + facing * 8, cy, r, facing > 0 ? -sweep : Math.PI - 0.2, facing > 0 ? 0.2 : Math.PI + sweep);
  ctx.stroke();
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, engine: Engine, viewW: number, viewH: number) {
  const p = engine.player;
  const a = engine.ai;
  const st = STANCES[p.stance];

  ctx.save();
  ctx.clearRect(0, 0, viewW, viewH);

  // scale to fit arena
  const scale = Math.min(viewW / ARENA.w, viewH / ARENA.h);
  ctx.translate((viewW - ARENA.w * scale) / 2, (viewH - ARENA.h * scale) / 2);
  ctx.scale(scale, scale);

  // shake
  if (engine.shake > 0) {
    ctx.translate((Math.random() - 0.5) * engine.shake, (Math.random() - 0.5) * engine.shake * 0.5);
  }

  // ── background ──
  const bg = ctx.createLinearGradient(0, 0, 0, ARENA.h);
  bg.addColorStop(0, '#080a18');
  bg.addColorStop(0.55, '#0d1024');
  bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // horizon glow tinted by oracle confidence
  const conf = engine.confidence;
  const hg = ctx.createRadialGradient(ARENA.w / 2, ARENA.ground, 20, ARENA.w / 2, ARENA.ground, 520);
  hg.addColorStop(0, `rgba(${Math.round(120 + conf * 100)},${Math.round(60 - conf * 20)},${Math.round(200)},${0.16 + conf * 0.14})`);
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);

  // perspective floor grid
  ctx.strokeStyle = 'rgba(99,102,241,0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 16; i++) {
    const x = (ARENA.w / 16) * i;
    ctx.beginPath();
    ctx.moveTo(x, ARENA.ground);
    ctx.lineTo(ARENA.w / 2 + (x - ARENA.w / 2) * 2.4, ARENA.h);
    ctx.stroke();
  }
  for (let i = 1; i <= 5; i++) {
    const y = ARENA.ground + Math.pow(i / 5, 1.9) * (ARENA.h - ARENA.ground);
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA.w, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ground line
  ctx.strokeStyle = 'rgba(148,163,184,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, ARENA.ground);
  ctx.lineTo(ARENA.w, ARENA.ground);
  ctx.stroke();

  // ── distance ruler between fighters ──
  const midY = ARENA.ground + 18;
  ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(Math.min(p.x, a.x), midY);
  ctx.lineTo(Math.max(p.x, a.x), midY);
  ctx.stroke();
  ctx.setLineDash([]);
  const dist = Math.abs(a.x - p.x);
  ctx.fillStyle = 'rgba(148,163,184,0.75)';
  ctx.font = `11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(dist)}u`, (p.x + a.x) / 2, midY + 14);

  // ── the oracle's live read: the thing you are actually fighting ──
  const plan = engine.plan;
  if (plan) {
    const meta = TOKEN_META[plan.target];
    const cMeta = COUNTER_META[plan.counter];
    const tLeft = Math.max(0, plan.expectedIn);
    ctx.save();
    ctx.strokeStyle = 'rgba(251,191,36,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 6]);
    ctx.beginPath();
    ctx.moveTo(a.x, ARENA.ground - 54);
    ctx.lineTo(p.x, ARENA.ground - 54);
    ctx.stroke();
    ctx.setLineDash([]);
    // closing countdown ring around the player
    const k = 1 - Math.min(1, tLeft / 0.62);
    ctx.strokeStyle = cMeta.color;
    ctx.shadowColor = cMeta.color;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, ARENA.ground - 52, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.font = `700 13px ${DISPLAY}`;
    ctx.fillStyle = cMeta.color;
    ctx.fillText(
      `${plan.launched ? '' : 'PREPPING '}${cMeta.label}`,
      a.x,
      ARENA.ground - 152,
    );
    ctx.font = `700 11px ${MONO}`;
    ctx.fillStyle = meta.color;
    ctx.fillText(
      `expects ${meta.label} in ${tLeft.toFixed(2)}s`,
      p.x,
      ARENA.ground - 92,
    );
    ctx.restore();
  }

  // ── player reach indicator ──
  const reach = ATTACKS.slash.range * st.range;
  ctx.strokeStyle = p.stance === 'orbit' ? 'rgba(34,211,238,0.22)' : 'rgba(244,63,94,0.22)';
  ctx.setLineDash([2, 8]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x + p.facing * reach, ARENA.ground - 2);
  ctx.lineTo(p.x + p.facing * reach, ARENA.ground - 40);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── oracle telegraph ──
  if (a.state === 'windup' && a.atk) {
    const total = a.atk.windup;
    const k = 1 - a.timer / Math.max(0.001, total);
    ctx.save();
    ctx.strokeStyle = 'rgba(244,63,94,0.75)';
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(a.x + a.facing * 8, ARENA.ground - 56, a.atk.range, -0.9, -0.9 + 1.8 * k);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#fda4af';
    ctx.font = `600 12px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(a.atk.label, a.x, ARENA.ground - 128 - Math.sin(engine.clock * 8) * 2);
  }

  // ── prediction ghosts ──
  const chain = engine.chain.map((c) => ({ ...c, inSec: Math.max(0, c.at - engine.clock) }));
  chain.forEach((c, i) => {
    const meta = TOKEN_META[c.token];
    const gx = ghostX(c.token, p.x, p.facing);
    const alpha = (0.34 - i * 0.09) * (0.55 + 0.45 * c.prob) * (engine.predictor.scramble > 0 ? 0.35 : 1);
    const gPose: Pose = {
      crouch: c.token === 'guard' ? 8 : 0,
      ext: c.token === 'jab' ? 0.8 : c.token === 'slash' ? 1 : c.token === 'throw' ? 0.9 : 0.2,
      lean: 0.1,
      arc: c.token === 'slash' ? 0.7 : 0,
      charge: 0.3,
      shield: c.token === 'guard' ? 1 : 0,
      wobble: Math.sin(engine.clock * 4 + i) * 2,
    };
    // dotted link from player to ghost
    ctx.save();
    ctx.strokeStyle = `rgba(226,232,240,${0.18 - i * 0.05})`;
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x, ARENA.ground - 44);
    ctx.lineTo(gx, ARENA.ground - 44);
    ctx.stroke();
    ctx.restore();

    drawBody(ctx, gx, p.facing, gPose, '#e2e8f0', '#ffffff', 10, alpha, true);

    // label + countdown
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 2.1));
    ctx.textAlign = 'center';
    ctx.fillStyle = meta.color;
    ctx.font = `700 13px ${DISPLAY}`;
    ctx.fillText(`${meta.glyph} ${meta.label}`, gx, ARENA.ground - 132 - i * 4);
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = 'rgba(226,232,240,0.85)';
    ctx.fillText(`+${c.inSec.toFixed(2)}s`, gx, ARENA.ground - 118 - i * 4);
    // confidence bar
    const bw = 46;
    ctx.strokeStyle = 'rgba(226,232,240,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx - bw / 2, ARENA.ground - 112 - i * 4, bw, 4);
    ctx.fillStyle = meta.color;
    ctx.fillRect(gx - bw / 2, ARENA.ground - 112 - i * 4, bw * c.prob, 4);
    ctx.restore();
  });

  // ── trails ──
  p.trail.forEach((t) => {
    if (p.state !== 'dash') return;
    drawBody(ctx, t.x, p.facing, poseFor(engine, 'player'), st.color, st.accent, 0, t.a * 0.18);
  });
  a.trail.forEach((t) => {
    if (a.state !== 'hop') return;
    drawBody(ctx, t.x, a.facing, poseFor(engine, 'ai'), '#e879f9', '#f5d0fe', 0, t.a * 0.16);
  });

  // ── fighters ──
  const pPose = poseFor(engine, 'player');
  const aPose = poseFor(engine, 'ai');
  const pColor = p.hitFlash > 0 ? '#fecaca' : st.color;
  drawBody(ctx, p.x, p.facing, pPose, pColor, st.accent, 22 + pPose.charge * 20);
  if (p.state === 'active' && p.atk) {
    drawAttackFx(ctx, p.x, p.facing, pPose, st.accent, ATTACKS[p.atk].range * st.range);
  }
  if (p.unreadable > 0) {
    ctx.save();
    ctx.strokeStyle = '#f0abfc';
    ctx.shadowColor = '#f0abfc';
    ctx.shadowBlur = 20;
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, ARENA.ground - 48, 46 + Math.sin(engine.clock * 20) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#f5d0fe';
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText('UNREADABLE', p.x, ARENA.ground - 116);
  }
  if (p.state === 'feign') {
    ctx.fillStyle = p.feignArmed ? '#a3e635' : '#64748b';
    ctx.font = `700 11px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.feignArmed ? 'ARMED FEINT' : 'FEINT', p.x, ARENA.ground - 116);
  }

  const aiBroken = a.state === 'broken';
  const aiColor = aiBroken ? (Math.floor(engine.clock * 18) % 2 ? '#7f1d1d' : '#f43f5e') : '#e879f9';
  drawBody(ctx, a.x, a.facing, aPose, aiColor, '#f5d0fe', 24 + aPose.charge * 26);
  if (a.state === 'active' && a.atk) {
    drawAttackFx(ctx, a.x, a.facing, aPose, '#fb7185', a.atk.range);
  }
  if (aiBroken) {
    ctx.fillStyle = '#22d3ee';
    ctx.font = `700 13px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText('⟨ MODEL DESYNCED ⟩', a.x, ARENA.ground - 126);
    ctx.font = `11px ${MONO}`;
    ctx.fillText(`punish window ${a.timer.toFixed(2)}s`, a.x, ARENA.ground - 112);
  }

  // ── particles ──
  engine.particles.forEach((q) => {
    const k = q.life / q.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    if (q.kind === 'ring') {
      ctx.strokeStyle = q.color;
      ctx.shadowColor = q.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3 * k + 1;
      ctx.beginPath();
      ctx.arc(q.x, q.y, (1 - k) * 90 * q.size + 6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = q.color;
      ctx.shadowColor = q.color;
      ctx.shadowBlur = 12;
      const s = q.size * (q.kind === 'shard' ? 1.4 : 1);
      ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.restore();
  });

  // ── floating numbers ──
  engine.floats.forEach((f) => {
    const k = f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.6));
    ctx.fillStyle = f.color;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 14;
    ctx.font = `700 ${f.size}px ${DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  });

  // ── combo ──
  if (engine.stats.combo > 1) {
    ctx.save();
    ctx.fillStyle = '#fde047';
    ctx.font = `700 22px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 16;
    ctx.fillText(`x${engine.stats.combo}`, p.x + 40, ARENA.ground - 150);
    ctx.restore();
  }

  // ── flash ──
  if (engine.flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, engine.flash * 2);
    ctx.fillStyle = engine.flashColor;
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    ctx.restore();
  }

  // vignette + scanlines
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const vg = ctx.createRadialGradient(ARENA.w / 2, ARENA.h / 2, 180, ARENA.w / 2, ARENA.h / 2, 640);
  vg.addColorStop(0, 'rgba(255,255,255,1)');
  vg.addColorStop(1, 'rgba(90,90,120,1)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#000';
  for (let y = 0; y < ARENA.h; y += 3) ctx.fillRect(0, y, ARENA.w, 1);
  ctx.restore();

  ctx.restore();
}
