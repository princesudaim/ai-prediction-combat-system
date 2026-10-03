import { useRef } from 'react';
import type { Snapshot } from '../game/engine';
import { COST } from '../game/engine';
import type { KeyLabels } from '../game/bindings';
import { COUNTER_META, STANCES, TOKEN_META, TOKENS, type Token } from '../game/types';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

// ── small parts ─────────────────────────────────────────────────────────────
/** white "recent damage" ghost bar: eases toward the real value each render */
function useLag(value: number, decay = 0.86) {
  const ref = useRef(value);
  const d = ref.current - value;
  ref.current = Math.abs(d) > 0.4 ? value + d * decay : value;
  return Math.max(ref.current, value);
}

function Meter({
  v,
  max = 100,
  color,
  track = 'rgba(148,163,184,0.14)',
  h = 'h-2.5',
  lag,
}: {
  v: number;
  max?: number;
  color: string;
  track?: string;
  h?: string;
  lag?: number;
}) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  const lpct = lag != null ? Math.max(0, Math.min(100, (lag / max) * 100)) : 0;
  return (
    <div className={cx('relative w-full overflow-hidden rounded-full', h)} style={{ background: track }}>
      {lag != null && lpct > pct && (
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/35 transition-none"
          style={{ width: `${lpct}%` }}
        />
      )}
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}` }}
      />
    </div>
  );
}

function Key({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <kbd
      className={cx(
        'mono inline-flex min-w-6 items-center justify-center rounded border px-1.5 py-0.5 text-[10px] leading-none',
        active
          ? 'border-cyan-300/70 bg-cyan-300/20 text-cyan-100'
          : 'border-slate-600/60 bg-slate-800/60 text-slate-300',
      )}
    >
      {children}
    </kbd>
  );
}

// ── top bars ────────────────────────────────────────────────────────────────
export function TopBars({ s }: { s: Snapshot }) {
  const pLag = useLag(s.playerHp);
  const aLag = useLag(s.aiHp);
  const st = STANCES[s.stance];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
      {/* you */}
      <div>
        <div className="mb-1 flex items-end justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tracking-[0.2em] text-cyan-200">YOU</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest"
              style={{ color: st.accent, background: `${st.color}22`, border: `1px solid ${st.color}66` }}
            >
              {st.label}
            </span>
          </div>
          <span className="mono text-xs text-slate-400">{Math.ceil(s.playerHp)}</span>
        </div>
        <Meter v={s.playerHp} color="#22d3ee" lag={pLag} h="h-3" />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="mono text-[10px] tracking-widest text-slate-500">ENTROPY</span>
          <div className="flex-1">
            <Meter
              v={s.entropy}
              color={s.entropy < 20 ? '#f97316' : '#c084fc'}
              h="h-1.5"
              track="rgba(192,132,252,0.12)"
            />
          </div>
          <span
            className={cx(
              'mono w-16 text-right text-[10px]',
              s.entropyRegen >= 0 ? 'text-emerald-300' : 'text-rose-300',
            )}
          >
            {s.entropyRegen >= 0 ? '+' : ''}
            {s.entropyRegen.toFixed(1)}/s
          </span>
        </div>
      </div>

      {/* center */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <div className="flex items-center gap-1.5">
          {[0, 1].map((i) => (
            <span
              key={i}
              className={cx(
                'h-2.5 w-2.5 rotate-45 border',
                i < s.wins ? 'border-cyan-300 bg-cyan-300' : 'border-slate-600',
              )}
            />
          ))}
          <span className="mono px-1 text-[11px] tracking-[0.25em] text-slate-400">RD {s.round}</span>
          {[1, 0].map((i) => (
            <span
              key={i}
              className={cx(
                'h-2.5 w-2.5 rotate-45 border',
                i < s.losses ? 'border-fuchsia-400 bg-fuchsia-400' : 'border-slate-600',
              )}
            />
          ))}
        </div>
        <div
          className={cx(
            'mono text-2xl font-bold leading-none tabular-nums',
            s.roundTime < 10 ? 'text-amber-300' : 'text-slate-200',
          )}
        >
          {Math.ceil(s.roundTime)}
        </div>
      </div>

      {/* oracle */}
      <div>
        <div className="mb-1 flex items-end justify-between">
          <span className="mono text-xs text-slate-400">{Math.ceil(s.aiHp)}</span>
          <span className="text-sm font-bold tracking-[0.2em] text-fuchsia-200">THE ORACLE</span>
        </div>
        <Meter v={s.aiHp} color="#e879f9" lag={aLag} h="h-3" />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="mono text-[10px] tracking-widest text-slate-500">MODEL READ</span>
          <div className="flex-1">
            <Meter
              v={s.confidence * 100}
              color={s.confidence > 0.66 ? '#f43f5e' : s.confidence > 0.4 ? '#fbbf24' : '#4ade80'}
              h="h-1.5"
              track="rgba(244,63,94,0.12)"
            />
          </div>
          <span className="mono w-16 text-right text-[10px] text-slate-300">
            {(s.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── prediction strip (the core interface) ───────────────────────────────────
export function PredictionStrip({ s }: { s: Snapshot }) {
  const scrambled = s.scramble > 0;
  return (
    <div className="relative rounded-xl border border-slate-700/50 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400">
            PREDICTION GHOST
          </span>
          {scrambled && (
            <span className="mono ob-flicker rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
              SCRAMBLED {s.scramble.toFixed(1)}s
            </span>
          )}
        </div>
        <span className="mono text-[10px] text-slate-500">
          horizon {s.horizon.toFixed(2)}s · {s.samples} samples
        </span>
      </div>

      <div className="flex min-h-[86px] items-stretch gap-2">
        <div className="flex w-24 shrink-0 flex-col justify-center rounded-lg border border-slate-700/40 bg-black/40 px-2">
          <span className="mono text-[9px] tracking-widest text-slate-500">NOW</span>
          <span className="mono text-[11px] text-cyan-200">you act</span>
        </div>
        {s.chain.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-700/60 px-4 text-center">
            <span className="mono text-[11px] text-slate-500">
              {scrambled ? 'oracle is blind — swing freely' : 'model has no read on you yet'}
            </span>
          </div>
        )}
        {s.chain.map((c, i) => {
          const meta = TOKEN_META[c.token];
          return (
            <div key={i} className="contents">
              <div className="flex items-center text-slate-600">→</div>
              <div
                key={i}
                className="ob-pop relative flex-1 overflow-hidden rounded-lg border bg-black/50 px-2.5 py-2"
                style={{ borderColor: `${meta.color}55` }}
              >
                <div
                  className="absolute inset-x-0 bottom-0 h-1"
                  style={{ background: meta.color, opacity: 0.35 + 0.5 * c.prob }}
                />
                <div className="flex items-baseline justify-between">
                  <span className="text-base font-bold" style={{ color: meta.color }}>
                    {meta.glyph} {meta.label}
                  </span>
                  <span className="mono text-[11px] tabular-nums text-slate-300">
                    +{c.inSec.toFixed(2)}s
                  </span>
                </div>
                <div className="mono mt-0.5 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{meta.hint}</span>
                  <span>p={(c.prob * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${c.prob * 100}%`, background: meta.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* the commit readout — what the oracle is about to do about it */}
      <div
        className={cx(
          'mt-2 flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
          s.plan
            ? 'border-amber-400/60 bg-amber-400/10'
            : 'border-slate-700/40 bg-black/30',
        )}
      >
        <span
          className={cx(
            'mono rounded px-2 py-1 text-[10px] font-bold tracking-widest',
            s.plan ? 'bg-amber-400 text-black' : 'bg-slate-800 text-slate-500',
          )}
        >
          {s.plan ? 'COMMITTED' : 'UNCOMMITTED'}
        </span>
        {s.plan ? (
          <>
            <span className="text-[12px] text-amber-100">
              Oracle expects{' '}
              <b style={{ color: TOKEN_META[s.plan.target].color }}>
                {TOKEN_META[s.plan.target].label}
              </b>{' '}
              in <b className="mono tabular-nums">{s.plan.expectedIn.toFixed(2)}s</b> → it is throwing a{' '}
              <b style={{ color: COUNTER_META[s.plan.counter].color }}>
                {COUNTER_META[s.plan.counter].label}
              </b>
            </span>
            <span className="mono ml-auto hidden text-[10px] text-amber-200/70 sm:block">
              do anything else = BREAK
            </span>
          </>
        ) : (
          <span className="mono text-[11px] text-slate-500">
            no active read — it is spacing and probing
          </span>
        )}
      </div>
    </div>
  );
}

// ── telemetry / model trace ─────────────────────────────────────────────────
export function Telemetry({ s }: { s: Snapshot }) {
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400">MODEL TRACE</span>
        <span className="mono text-[10px] text-slate-500">n-gram · ctx {s.ctx.length}/3</span>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {s.ctx.length === 0 && <span className="mono text-[10px] text-slate-600">∅</span>}
        {s.ctx.map((t, i) => (
          <span
            key={i}
            className="mono rounded border px-1.5 py-0.5 text-[10px]"
            style={{ color: TOKEN_META[t].color, borderColor: `${TOKEN_META[t].color}44` }}
          >
            {TOKEN_META[t].label}
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {s.trace.map((t) => (
          <div key={t.token} className="flex items-center gap-2">
            <span className="mono w-16 shrink-0 text-[10px]" style={{ color: TOKEN_META[t.token].color }}>
              {TOKEN_META[t.token].label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${t.p * 100}%`, background: TOKEN_META[t.token].color }}
              />
            </div>
            <span className="mono w-9 text-right text-[10px] text-slate-500">
              {(t.p * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
      <div className="mono mt-2 grid grid-cols-3 gap-2 border-t border-slate-700/40 pt-2 text-center text-[10px]">
        <div>
          <div className="text-amber-300">{s.reads}</div>
          <div className="text-slate-500">reads</div>
        </div>
        <div>
          <div className="text-cyan-300">{s.breaks}</div>
          <div className="text-slate-500">breaks</div>
        </div>
        <div>
          <div className="text-lime-300">{s.baits}</div>
          <div className="text-slate-500">baits</div>
        </div>
      </div>
    </div>
  );
}

// ── entropy abilities ───────────────────────────────────────────────────────
export function Abilities({
  s,
  onPress,
  keys,
}: {
  s: Snapshot;
  onPress: (b: string) => void;
  keys: KeyLabels;
}) {
  const items = [
    {
      k: keys.cancel,
      btn: 'cancel',
      name: 'LATE CANCEL',
      cost: COST.cancel,
      desc: 'erase recovery → unreadable jab',
      ok: s.canCancel,
      color: '#f0abfc',
    },
    {
      k: keys.feign,
      btn: 'feign',
      name: 'FAKE RECOVERY',
      cost: COST.feign,
      desc: 'look helpless · auto-parry',
      ok: s.canFeign,
      color: '#a3e635',
    },
    {
      k: keys.swap,
      btn: 'swap',
      name: 'STANCE SWAP',
      cost: COST.swap,
      desc: `go ${s.stance === 'orbit' ? 'CRASH' : 'ORBIT'} · jam model 3.6s`,
      ok: s.canSwap,
      color: '#38bdf8',
    },
  ];
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400">
          IMPOSSIBLE DEVIATIONS
        </span>
        <span
          className={cx(
            'mono text-[10px]',
            s.entropyRegen >= 0 ? 'text-emerald-300' : 'text-rose-300',
          )}
        >
          ENT {Math.floor(s.entropy)}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <button
            key={it.k}
            onPointerDown={(e) => {
              e.preventDefault();
              onPress(it.btn);
            }}
            className={cx(
              'group relative overflow-hidden rounded-lg border px-2.5 py-2 text-left transition-all',
              it.ok
                ? 'border-slate-600 bg-black/50 hover:border-slate-400 active:scale-[0.98]'
                : 'border-slate-800 bg-black/20 opacity-45',
            )}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key active={it.ok}>{it.k}</Key>
                <span className="text-[12px] font-bold" style={{ color: it.color }}>
                  {it.name}
                </span>
              </span>
              <span className="mono text-[10px] text-violet-300">{it.cost}</span>
            </div>
            <div className="mono mt-1 text-[10px] leading-tight text-slate-500">{it.desc}</div>
          </button>
        ))}
      </div>
      <p className="mono mt-2 text-[10px] leading-relaxed text-slate-500">
        entropy regenerates from <span className="text-amber-300">being predictable</span>. random
        button-mashing starves the meter — the oracle must <i>think it knows you</i>.
      </p>
    </div>
  );
}

// ── log ─────────────────────────────────────────────────────────────────────
export function LogFeed({ s }: { s: Snapshot }) {
  const color: Record<string, string> = {
    read: 'text-amber-300',
    break: 'text-cyan-300',
    bait: 'text-lime-300',
    scramble: 'text-fuchsia-300',
    info: 'text-slate-500',
    hit: 'text-slate-300',
  };
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/70 p-3">
      <div className="mb-2 text-[11px] font-bold tracking-[0.3em] text-slate-400">TELEMETRY LOG</div>
      <div className="ob-scroll h-[104px] space-y-1 overflow-y-auto pr-1">
        {s.log.map((l) => (
          <div key={l.id} className={cx('mono ob-slide text-[10px]', color[l.kind])}>
            <span className="text-slate-700">›</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── in-canvas overlays ──────────────────────────────────────────────────────
export function Callouts({ s }: { s: Snapshot }) {
  const style: Record<string, string> = {
    read: 'text-amber-300 border-amber-400/50 bg-amber-500/10',
    break: 'text-cyan-200 border-cyan-400/50 bg-cyan-400/10',
    bait: 'text-lime-200 border-lime-400/50 bg-lime-400/10',
    scramble: 'text-fuchsia-200 border-fuchsia-400/50 bg-fuchsia-400/10',
    info: 'text-slate-300 border-slate-500/40 bg-slate-800/30',
    hit: 'text-slate-200 border-slate-600/40 bg-slate-800/30',
  };
  return (
    <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-1.5">
      {s.callouts.map((c) => {
        const k = c.life / c.maxLife;
        return (
          <div
            key={c.id}
            className={cx('ob-pop rounded-lg border px-4 py-1.5 text-center backdrop-blur-sm', style[c.kind])}
            style={{ opacity: Math.min(1, k * 2.4) }}
          >
            <div className="text-lg font-black tracking-[0.18em]">{c.text}</div>
            <div className="mono text-[10px] opacity-70">{c.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── touch / click controls ──────────────────────────────────────────────────
export function TouchControls({
  onPress,
  onHold,
  keys,
  onRebind,
}: {
  onPress: (b: string) => void;
  onHold: (k: 'left' | 'right' | 'guard', v: boolean) => void;
  keys: KeyLabels;
  onRebind: () => void;
}) {
  const hold = (k: 'left' | 'right' | 'guard') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onHold(k, true);
    },
    onPointerUp: () => onHold(k, false),
    onPointerLeave: () => onHold(k, false),
    onPointerCancel: () => onHold(k, false),
  });
  const tap = (b: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      onPress(b);
    },
  });
  const cls =
    'touch-none flex select-none flex-col items-center gap-0.5 rounded-lg border border-slate-600/70 bg-black/50 py-2 text-center text-[11px] font-bold tracking-wider text-slate-200 active:scale-95 active:border-cyan-300 active:text-cyan-200';
  const chip = 'mono rounded border border-slate-700/70 bg-slate-900/70 px-1 text-[9px] font-normal leading-4 text-slate-500';
  const holds: { k: 'left' | 'right' | 'guard'; label: string; key: string }[] = [
    { k: 'left', label: '◀ BACK', key: keys.left },
    { k: 'right', label: 'FWD ▶', key: keys.right },
    { k: 'guard', label: '⬢ GUARD', key: keys.guard },
  ];
  const taps: { b: string; label: string; key: string; tone?: string }[] = [
    { b: 'dash', label: '» DASH', key: keys.dash },
    { b: 'jab', label: '⚡ JAB', key: keys.jab },
    { b: 'slash', label: '✦ SLASH', key: keys.slash },
    { b: 'throw', label: '◎ THROW', key: keys.throw },
    { b: 'cancel', label: '⌫ CANCEL', key: keys.cancel, tone: 'text-fuchsia-200' },
    { b: 'feign', label: '☂ FEIGN', key: keys.feign, tone: 'text-lime-200' },
    { b: 'swap', label: '⇄ STANCE', key: keys.swap, tone: 'text-sky-200' },
  ];
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-950/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400">FIGHT PAD</span>
        <button
          onClick={onRebind}
          className="mono rounded border border-indigo-400/40 bg-indigo-400/10 px-2 py-1 text-[10px] tracking-[0.2em] text-indigo-200 hover:border-indigo-300 hover:text-white"
        >
          ⚙ REBIND KEYS
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {holds.map((h) => (
          <button key={h.k} className={cls} {...hold(h.k)}>
            <span>{h.label}</span>
            <span className={chip}>{h.key}</span>
          </button>
        ))}
        {taps.map((t) => (
          <button key={t.b} className={cx(cls, t.tone)} {...tap(t.b)}>
            <span>{t.label}</span>
            <span className={chip}>{t.key}</span>
          </button>
        ))}
        <button
          className={cx(cls, 'col-span-2 border-indigo-400/40 text-indigo-200')}
          onClick={onRebind}
        >
          <span>⚙ REBIND EVERY KEY</span>
          <span className={chip}>presets · swap · unbind</span>
        </button>
      </div>
      <div className="mono mt-2 hidden gap-3 text-[10px] text-slate-500 md:flex md:flex-wrap">
        <span>
          <Key>{keys.left}</Key>/<Key>{keys.right}</Key> move
        </span>
        <span>
          <Key>{keys.guard}</Key> guard
        </span>
        <span>
          <Key>{keys.dash}</Key> dash
        </span>
        <span>
          <Key>{keys.jab}</Key> jab
        </span>
        <span>
          <Key>{keys.slash}</Key> slash
        </span>
        <span>
          <Key>{keys.throw}</Key> throw
        </span>
        <span>
          <Key>{keys.cancel}</Key> late cancel
        </span>
        <span>
          <Key>{keys.feign}</Key> feint
        </span>
        <span>
          <Key>{keys.swap}</Key> stance
        </span>
        <span>
          <Key>{keys.pause}</Key> pause
        </span>
      </div>
      <div className="mono mt-1.5 text-[10px] text-slate-600 md:hidden">
        every key is rebindable — hit ⚙ REBIND KEYS
      </div>
    </div>
  );
}

export function tokenLegend() {
  return TOKENS.map((t: Token) => TOKEN_META[t]);
}
