import { useEffect, useState } from 'react';
import {
  BINDING_DEFS,
  DEFAULT_BINDINGS,
  PRESETS,
  keyLabel,
  type ActionId,
  type Bindings,
} from '../game/bindings';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

const GROUPS: { id: 'MOVEMENT' | 'OFFENSE' | 'ENTROPY' | 'SYSTEM'; title: string; note: string }[] = [
  { id: 'MOVEMENT', title: 'MOVEMENT', note: 'held keys' },
  { id: 'OFFENSE', title: 'OFFENSE', note: 'tapped' },
  { id: 'ENTROPY', title: 'IMPOSSIBLE DEVIATIONS', note: 'spend meter' },
  { id: 'SYSTEM', title: 'SYSTEM', note: 'tapped' },
];

export function RebindPanel({
  bindings,
  onChange,
  listening,
  setListening,
  onClose,
}: {
  bindings: Bindings;
  onChange: (b: Bindings) => void;
  listening: ActionId | null;
  setListening: (a: ActionId | null) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState<string>('click a key slot, then press any key');

  // capture-phase listener so the rebind swallows the key before the game does
  useEffect(() => {
    if (!listening) return;
    const down = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setListening(null);
        setNote('cancelled — ESC is reserved for closing dialogs');
        return;
      }
      const taken = BINDING_DEFS.find((d) => d.id !== listening && bindings[d.id] === e.code);
      const next: Bindings = { ...bindings };
      if (taken) {
        next[taken.id] = bindings[listening]; // swap, so nothing is ever lost
        setNote(`swapped with ${taken.label}`);
      } else {
        setNote(`bound to ${keyLabel(e.code)}`);
      }
      next[listening] = e.code;
      onChange(next);
      setListening(null);
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [listening, bindings, onChange, setListening]);

  const clear = (id: ActionId) => {
    const next: Bindings = { ...bindings };
    next[id] = '';
    onChange(next);
    setNote('unbound — the on-screen button still works');
    setListening(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="ob-pop w-full max-w-3xl rounded-2xl border border-indigo-400/30 bg-[#0a0c1c] p-5 shadow-[0_0_80px_-20px_rgba(99,102,241,0.6)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-[0.25em] text-slate-100">REBIND CONTROLS</h2>
            <p className="mono mt-1 text-[10px] text-slate-500">
              {note}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-4 py-2 text-[11px] font-bold tracking-[0.25em] text-cyan-100 hover:bg-cyan-400/20"
          >
            DONE
          </button>
        </div>

        <div className="ob-scroll mt-4 max-h-[58vh] space-y-4 overflow-y-auto pr-1">
          {GROUPS.map((g) => (
            <div key={g.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-bold tracking-[0.3em] text-slate-400">{g.title}</span>
                <span className="mono text-[9px] text-slate-600">{g.note}</span>
                <span className="h-px flex-1 bg-slate-700/50" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {BINDING_DEFS.filter((d) => d.group === g.id).map((d) => {
                  const isListening = listening === d.id;
                  const bound = !!bindings[d.id];
                  return (
                    <div
                      key={d.id}
                      className={cx(
                        'flex items-center gap-3 rounded-lg border bg-black/40 px-3 py-2 transition-colors',
                        isListening ? 'border-cyan-300 bg-cyan-400/10' : 'border-slate-700/50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-bold" style={{ color: d.color }}>
                          {d.label}
                        </div>
                        <div className="mono truncate text-[10px] text-slate-500">{d.hint}</div>
                      </div>
                      <button
                        onClick={() => setListening(isListening ? null : d.id)}
                        className={cx(
                          'mono min-w-[86px] rounded-md border px-2 py-1.5 text-[11px] font-bold tracking-wider',
                          isListening
                            ? 'ob-flicker border-cyan-300 bg-cyan-300/20 text-cyan-100'
                            : bound
                              ? 'border-slate-500 bg-slate-800/70 text-slate-100 hover:border-slate-300'
                              : 'border-dashed border-slate-600 text-slate-600',
                        )}
                      >
                        {isListening ? 'PRESS KEY' : keyLabel(bindings[d.id])}
                      </button>
                      <button
                        onClick={() => clear(d.id)}
                        title="unbind"
                        className="mono rounded-md border border-slate-700 px-1.5 py-1.5 text-[10px] text-slate-500 hover:border-rose-400/60 hover:text-rose-300"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-slate-700/50 pt-4">
          <div className="mono mb-2 text-[10px] tracking-[0.25em] text-slate-500">LAYOUT PRESETS</div>
          <div className="grid gap-2 sm:grid-cols-4">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  onChange({ ...p.bindings });
                  setListening(null);
                  setNote(`${p.name} layout loaded`);
                }}
                className="rounded-lg border border-slate-700 bg-black/40 px-2 py-2 text-left hover:border-indigo-400/60"
              >
                <div className="text-[11px] font-bold tracking-[0.15em] text-slate-200">{p.name}</div>
                <div className="mono mt-0.5 text-[9px] leading-tight text-slate-500">{p.blurb}</div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={() => {
                onChange({ ...DEFAULT_BINDINGS });
                setListening(null);
                setNote('defaults restored');
              }}
              className="mono rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] tracking-[0.2em] text-slate-400 hover:text-slate-100"
            >
              RESET DEFAULTS
            </button>
            <p className="mono text-[10px] text-slate-600">
              duplicate keys auto-swap · ESC cancels a capture · bindings are saved to this browser
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
