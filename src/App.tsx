import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine, type Snapshot } from './game/engine';
import { render } from './game/render';
import {
  Abilities,
  Callouts,
  LogFeed,
  PredictionStrip,
  Telemetry,
  TopBars,
  TouchControls,
} from './components/Hud';
import { RebindPanel } from './components/RebindPanel';
import {
  actionFor,
  keyLabel,
  labelsOf,
  loadBindings,
  saveBindings,
  type ActionId,
  type Bindings,
} from './game/bindings';
import { TOKENS, TOKEN_META } from './game/types';

type Screen = 'title' | 'fight' | 'result';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

/** live, state-aware teaching layer — the game's core loop is not obvious */
function coach(s: Snapshot) {
  if (s.phase === 'roundEnd') return 'round over — the model keeps every sample it collected';
  if (s.scramble > 0) return 'model scrambled: its read % is junk for a few seconds. swing now.';
  if (s.plan)
    return `COMMITTED — it expects ${s.plan.target.toUpperCase()}. do literally anything else and it whiffs.`;
  if (s.samples < 10) return 'warming up: repeat a comfortable pattern so the model has something to learn.';
  if (s.entropy < 22)
    return 'entropy starving — you are too random for the oracle to trust a read. settle into a rhythm.';
  if (s.confidence > 0.66)
    return 'it is confident. feed the pattern once more, then break it for a 2.3× punish.';
  if (s.confidence < 0.3)
    return 'the oracle is guessing. this is your window to pressure it — but your entropy will suffer.';
  if (s.roundTime < 12) return 'time — the higher HP bar takes the round.';
  return 'dash in, bait a read, then deviate. feints turn its aggression into free damage.';
}

export default function App() {
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = new Engine();
  const engine = engineRef.current;

  const [screen, setScreen] = useState<Screen>('title');
  const [paused, setPaused] = useState(false);
  const [rebind, setRebind] = useState(false);
  const [listening, setListening] = useState<ActionId | null>(null);
  const [bindings, setBindings] = useState<Bindings>(() => loadBindings());
  const [snap, setSnap] = useState<Snapshot>(() => engine.snapshot());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const keys = useMemo(() => labelsOf(bindings), [bindings]);
  const frozen = paused || rebind;

  useEffect(() => saveBindings(bindings), [bindings]);

  const startMatch = useCallback(() => {
    engine.newMatch();
    setPaused(false);
    setRebind(false);
    setListening(null);
    setScreen('fight');
  }, [engine]);

  const openRebind = useCallback(() => {
    engine.input.left = false;
    engine.input.right = false;
    engine.input.guard = false;
    setListening(null);
    setRebind(true);
  }, [engine]);

  const closeRebind = useCallback(() => {
    setListening(null);
    setRebind(false);
    setPaused(false);
  }, []);

  // ── game loop ──
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      if (screen === 'fight' && !frozen) engine.update(dt);
      const c = canvasRef.current;
      if (c) {
        const ctx = c.getContext('2d');
        if (ctx) render(ctx, engine, c.width, c.height);
      }
      if (++frame % 2 === 0) setSnap(engine.snapshot());
      if (screen === 'fight' && engine.phase === 'matchEnd') setScreen('result');
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen, frozen, engine]);

  // ── keyboard (fully rebindable) ──
  useEffect(() => {
    const UI_OK = ['Enter', 'NumpadEnter', 'Space'];
    const down = (e: KeyboardEvent) => {
      const code = e.code;
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab'].includes(code)) {
        e.preventDefault();
      }
      // the rebind panel owns the keyboard while it is listening
      if (rebind) return;
      if (screen === 'title' || screen === 'result') {
        if (UI_OK.includes(code)) startMatch();
        return;
      }
      const action = actionFor(bindings, code);
      if (!action) return;
      if (action === 'pause') {
        setPaused((p) => !p);
        return;
      }
      if (frozen) return;
      if (e.repeat) return;
      switch (action) {
        case 'left':
          engine.input.left = true;
          if (engine.phase === 'fight') engine.emit('retreat');
          break;
        case 'right':
          engine.input.right = true;
          if (engine.phase === 'fight') engine.emit('advance');
          break;
        case 'guard':
          engine.input.guard = true;
          break;
        default:
          engine.press(action);
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const action = actionFor(bindings, e.code);
      if (!action) return;
      if (action === 'left') engine.input.left = false;
      if (action === 'right') engine.input.right = false;
      if (action === 'guard') engine.input.guard = false;
    };
    const blur = () => {
      engine.input.left = false;
      engine.input.right = false;
      engine.input.guard = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [screen, frozen, rebind, bindings, engine, startMatch]);

  const onPress = useCallback((b: string) => engine.press(b), [engine]);
  const onHold = useCallback(
    (k: 'left' | 'right' | 'guard', v: boolean) => {
      engine.input[k] = v;
      if (v && engine.phase === 'fight' && k !== 'guard') {
        engine.emit(k === 'left' ? 'retreat' : 'advance');
      }
    },
    [engine],
  );

  const rebindPanel = (
    <RebindPanel
      bindings={bindings}
      onChange={setBindings}
      listening={listening}
      setListening={setListening}
      onClose={closeRebind}
    />
  );

  // ── title ──
  if (screen === 'title') {
    return (
      <div className="ob-grid min-h-screen bg-[#05060f] text-slate-200">
        {rebind && rebindPanel}
        <div className="mx-auto max-w-5xl px-5 py-10 md:py-16">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="mono rounded bg-fuchsia-500/20 px-2 py-1 text-[10px] tracking-[0.3em] text-fuchsia-200">
              OFFLINE AI · N-GRAM MARKOV
            </span>
            <span className="mono rounded bg-cyan-500/15 px-2 py-1 text-[10px] tracking-[0.3em] text-cyan-200">
              1V1 · BEST OF 3
            </span>
            <span className="mono rounded bg-indigo-500/15 px-2 py-1 text-[10px] tracking-[0.3em] text-indigo-200">
              FULLY REBINDABLE
            </span>
          </div>
          <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
            <span className="bg-gradient-to-r from-cyan-200 via-slate-100 to-fuchsia-300 bg-clip-text text-transparent">
              ORACLE BREAKER
            </span>
          </h1>
          <p className="mono mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            fight the prediction, not the character. the oracle runs a live n-gram model on every
            input you make and paints a{' '}
            <span className="text-slate-100">ghost of what it thinks you'll do next</span>. your job
            is to be readable long enough to be dangerous — then betray it.
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              {
                t: 'THE GHOST',
                c: '#e2e8f0',
                d: 'A translucent silhouette previews your predicted action chain 1–2 seconds ahead — including when it expects you to do it.',
                icon: '◌',
              },
              {
                t: 'ENTROPY METER',
                c: '#c084fc',
                d: 'Spend entropy on impossible deviations: late cancels, fake recoveries, stance swaps. It refills fastest when the oracle is confident it has you figured out.',
                icon: '≋',
              },
              {
                t: 'THE PUNISH',
                c: '#22d3ee',
                d: 'Match the prediction → you get READ for heavy damage. Deviate while it is committed → the oracle whiffs and takes a 2.3× BREAK punish.',
                icon: '✕',
              },
            ].map((k) => (
              <div
                key={k.t}
                className="rounded-2xl border border-slate-700/50 bg-slate-950/60 p-4 backdrop-blur"
              >
                <div className="text-2xl" style={{ color: k.c }}>
                  {k.icon}
                </div>
                <div className="mt-1 text-sm font-bold tracking-[0.2em]" style={{ color: k.c }}>
                  {k.t}
                </div>
                <p className="mono mt-2 text-[11px] leading-relaxed text-slate-400">{k.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-2xl border border-slate-700/50 bg-slate-950/60 p-4">
              <div className="mono mb-3 text-[10px] tracking-[0.3em] text-slate-500">
                WHAT THE MODEL WATCHES FOR
              </div>
              <div className="flex flex-wrap gap-2">
                {TOKENS.map((t) => {
                  const m = TOKEN_META[t];
                  return (
                    <span
                      key={t}
                      className="mono flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px]"
                      style={{ borderColor: `${m.color}44`, color: m.color }}
                    >
                      <span>{m.glyph}</span>
                      {m.label}
                      <span className="text-slate-600">{m.hint}</span>
                    </span>
                  );
                })}
              </div>
              <p className="mono mt-3 text-[11px] leading-relaxed text-slate-500">
                the model is order-3 with backoff, recency-weighted, and it learns your{' '}
                <span className="text-slate-300">timing</span> as well as your moves. it also changes
                how far ahead it looks based on how often it has been right. mash randomly and it
                stops predicting — but your entropy meter starves, and you lose your only real weapon.
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-400/25 bg-slate-950/60 p-4">
              <div className="mono mb-3 text-[10px] tracking-[0.3em] text-slate-500">
                YOUR CURRENT LAYOUT
              </div>
              <div className="mono grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                {[
                  ['move', `${keys.left} / ${keys.right}`],
                  ['guard', keys.guard],
                  ['dash', keys.dash],
                  ['jab', keys.jab],
                  ['slash', keys.slash],
                  ['throw', keys.throw],
                  ['late cancel', keys.cancel],
                  ['fake recovery', keys.feign],
                  ['stance swap', keys.swap],
                  ['pause', keys.pause],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-baseline justify-between gap-2 border-b border-slate-800 pb-1">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-bold text-slate-200">{val}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={openRebind}
                className="mono mt-4 w-full rounded-lg border border-indigo-400/50 bg-indigo-400/10 px-3 py-2 text-[10px] tracking-[0.25em] text-indigo-100 hover:border-indigo-300 hover:bg-indigo-400/20"
              >
                ⚙ REBIND EVERY KEY
              </button>
            </div>
          </div>

          <button
            onClick={startMatch}
            className="ob-pulse mt-8 w-full rounded-xl border border-cyan-300/50 bg-cyan-400/10 px-6 py-4 text-lg font-black tracking-[0.3em] text-cyan-100 transition-colors hover:bg-cyan-400/20 md:w-auto"
          >
            ENTER THE ORACLE →
          </button>
          <p className="mono mt-3 text-[10px] text-slate-600">
            press ENTER to fight · current layout: {keys.left}/{keys.right} move · {keys.guard} guard ·{' '}
            {keys.dash} dash · {keys.jab}/{keys.slash}/{keys.throw} attack · {keys.cancel}/
            {keys.feign}/{keys.swap} entropy
          </p>
        </div>
      </div>
    );
  }

  // ── results ──
  if (screen === 'result') {
    const readRate = snap.reads + snap.breaks > 0 ? snap.reads / (snap.reads + snap.breaks) : 0;
    const win = snap.matchResult === 'VICTORY';
    return (
      <div className="ob-grid flex min-h-screen items-center justify-center bg-[#05060f] px-5 py-10 text-slate-200">
        {rebind && rebindPanel}
        <div className="w-full max-w-2xl rounded-2xl border border-slate-700/50 bg-slate-950/70 p-6 backdrop-blur">
          <div
            className={cx(
              'text-4xl font-black tracking-[0.15em] md:text-5xl',
              win ? 'text-cyan-200' : 'text-fuchsia-300',
            )}
          >
            {snap.matchResult}
          </div>
          <p className="mono mt-2 text-xs text-slate-400">
            {win
              ? 'you made the oracle distrust its own model.'
              : 'the oracle read you like a training set. rematch and change your rhythm.'}
          </p>
          <div className="mono mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['ROUNDS', `${snap.wins} – ${snap.losses}`, '#e2e8f0'],
              ['PREDICTIONS BROKEN', String(snap.breaks), '#22d3ee'],
              ['TIMES READ', String(snap.reads), '#fbbf24'],
              [
                'READ RATE',
                `${(readRate * 100).toFixed(0)}%`,
                readRate > 0.5 ? '#f87171' : '#4ade80',
              ],
              ['BAITS LANDED', String(snap.baits), '#a3e635'],
              ['BEST COMBO', `x${snap.bestCombo}`, '#fde047'],
              ['DAMAGE DEALT', String(Math.round(snap.damageDealt)), '#a5f3fc'],
              ['MODEL SAMPLES', String(snap.samples), '#c084fc'],
              ['LAYOUT', keyLabel(bindings.dash) === '—' ? 'CUSTOM' : 'SAVED', '#818cf8'],
            ].map(([label, val, color]) => (
              <div key={label} className="rounded-xl border border-slate-700/40 bg-black/40 p-3">
                <div className="text-[9px] tracking-[0.2em] text-slate-500">{label}</div>
                <div className="mt-1 text-xl font-bold" style={{ color: color as string }}>
                  {val}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={startMatch}
            className="mt-6 w-full rounded-xl border border-cyan-300/50 bg-cyan-400/10 px-6 py-3 text-sm font-black tracking-[0.3em] text-cyan-100 hover:bg-cyan-400/20"
          >
            REMATCH · WIPE THE MODEL
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setScreen('title')}
              className="mono rounded-xl border border-slate-700 px-6 py-2 text-[11px] tracking-[0.2em] text-slate-400 hover:text-slate-200"
            >
              BACK TO BRIEFING
            </button>
            <button
              onClick={openRebind}
              className="mono rounded-xl border border-indigo-400/40 px-6 py-2 text-[11px] tracking-[0.2em] text-indigo-200 hover:border-indigo-300 hover:text-white"
            >
              ⚙ REBIND KEYS
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── fight ──
  return (
    <div className="min-h-screen bg-[#05060f] text-slate-200">
      {rebind && rebindPanel}
      <div className="mx-auto max-w-[1200px] px-3 py-3 md:px-5 md:py-4">
        <TopBars s={snap} />

        <div className="relative mt-3 overflow-hidden rounded-2xl border border-indigo-400/20 bg-black shadow-[0_0_60px_-20px_rgba(99,102,241,0.5)]">
          <canvas
            ref={canvasRef}
            width={1920}
            height={760}
            className="block h-auto w-full touch-none select-none"
          />
          <Callouts s={snap} />

          {snap.phase === 'roundEnd' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-3xl font-black tracking-[0.25em] text-slate-100">
                {snap.roundResult}
              </div>
              <div className="mono mt-2 text-[11px] text-slate-400">
                model retained · {snap.samples} samples carried into round {snap.round + 1}
              </div>
            </div>
          )}
          {paused && !rebind && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 backdrop-blur">
              <div className="text-2xl font-black tracking-[0.3em] text-slate-200">PAUSED</div>
              <div className="mono max-w-md text-center text-[11px] leading-relaxed text-slate-400">
                the ghost is what the oracle expects. commit to a pattern, let its read % climb,
                then deviate the instant the COMMITTED badge appears — that whiff is your punish.
              </div>
              <div className="mono flex flex-wrap justify-center gap-2 text-[10px] text-slate-500">
                <span>move {keys.left}/{keys.right}</span>
                <span>guard {keys.guard}</span>
                <span>dash {keys.dash}</span>
                <span>
                  attack {keys.jab}/{keys.slash}/{keys.throw}
                </span>
                <span>
                  entropy {keys.cancel}/{keys.feign}/{keys.swap}
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setPaused(false)}
                  className="rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-5 py-2 text-xs font-bold tracking-[0.3em] text-cyan-100"
                >
                  RESUME
                </button>
                <button
                  onClick={openRebind}
                  className="mono rounded-lg border border-indigo-400/50 px-5 py-2 text-xs tracking-[0.25em] text-indigo-200 hover:border-indigo-300 hover:text-white"
                >
                  ⚙ REBIND
                </button>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
            <div className="mono rounded border border-fuchsia-400/30 bg-black/60 px-2 py-1 text-[10px] text-fuchsia-200">
              ORACLE {snap.aiLabel || snap.aiState.toUpperCase()}
            </div>
            {snap.combo > 1 && (
              <div className="mono rounded border border-amber-300/40 bg-black/60 px-2 py-1 text-[10px] text-amber-200">
                COMBO x{snap.combo}
              </div>
            )}
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            className="mono absolute bottom-3 right-3 rounded border border-slate-600/30 bg-black/60 px-2 py-1 text-[10px] text-slate-400 hover:text-slate-100"
          >
            {keys.pause} pause · ⚙ rebind
          </button>
        </div>

        <div className="mono mt-2 flex items-center gap-2 overflow-hidden rounded-lg border border-slate-700/40 bg-slate-950/60 px-3 py-1.5 text-[10px] text-slate-400">
          <span className="shrink-0 text-cyan-300">◈ COACH</span>
          <span className="truncate">{coach(snap)}</span>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            <PredictionStrip s={snap} />
            <Abilities s={snap} onPress={onPress} keys={keys} />
          </div>
          <div className="space-y-3">
            <Telemetry s={snap} />
            <LogFeed s={snap} />
            <TouchControls onPress={onPress} onHold={onHold} keys={keys} onRebind={openRebind} />
          </div>
        </div>
      </div>
    </div>
  );
}
