import { useState } from 'react';
import { AlertTriangle, Trash2, X, CheckCircle2, Loader2, Database } from 'lucide-react';

interface ResetDbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete: () => void;
  currentMode: 'all' | 'live' | 'dry-run';
}

export const ResetDbModal: React.FC<ResetDbModalProps> = ({
  isOpen,
  onClose,
  onResetComplete,
  currentMode,
}) => {
  const [scope, setScope] = useState<'all' | 'live' | 'dry-run'>(
    currentMode === 'all' ? 'all' : currentMode
  );
  const [clearTicks, setClearTicks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ clearedPositions: number; clearedTicks: number } | null>(
    null
  );

  if (!isOpen) return null;

  const handleReset = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reset-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: scope,
          clearTicks: scope === 'all' ? clearTicks : false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reset database');
      }

      setResult({
        clearedPositions: data.clearedPositions ?? 0,
        clearedTicks: data.clearedTicks ?? 0,
      });

      // Notify parent to refetch data
      onResetComplete();

      // Automatically close modal after brief delay
      setTimeout(() => {
        setResult(null);
        onClose();
      }, 1400);
    } catch (err: any) {
      setError(err?.message || 'Error executing database reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f1422] border border-rose-500/30 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-2xl shadow-rose-950/40 relative">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800/80 bg-rose-500/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
              <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Reset SQLite Database
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">Purge recorded trades & historical data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {result ? (
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-2">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="text-sm font-bold text-white">Database Reset Complete</h4>
              <p className="text-xs text-slate-400">
                Purged <strong className="text-emerald-400">{result.clearedPositions}</strong> positions
                {result.clearedTicks > 0 && (
                  <span>
                    {' '}and <strong className="text-emerald-400">{result.clearedTicks}</strong> price ticks
                  </span>
                )}.
              </p>
            </div>
          ) : (
            <>
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-500/20 text-rose-300 space-y-1">
                <p className="font-semibold text-rose-200">Warning: Destructive Operation</p>
                <p className="text-[11px] text-rose-300/80 leading-relaxed">
                  This will permanently delete position records from SQLite (<code className="bg-rose-900/40 px-1 py-0.5 rounded text-[10px] font-mono">data/bot.db</code>).
                  Metrics, PnL calculations, and charts will be reset.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs">
                  {error}
                </div>
              )}

              {/* Scope Selection */}
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-blue-400" /> Select Reset Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('all')}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      scope === 'all'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-200 font-semibold shadow-sm'
                        : 'bg-gray-900/60 border-gray-800 text-slate-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    All Data
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('live')}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      scope === 'live'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-200 font-semibold shadow-sm'
                        : 'bg-gray-900/60 border-gray-800 text-slate-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    Live Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('dry-run')}
                    className={`py-2 px-2.5 rounded-xl border text-center transition-all ${
                      scope === 'dry-run'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-200 font-semibold shadow-sm'
                        : 'bg-gray-900/60 border-gray-800 text-slate-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    Paper Only
                  </button>
                </div>
              </div>

              {/* Clear ticks option when All Data is selected */}
              {scope === 'all' && (
                <label className="flex items-center gap-2.5 pt-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={clearTicks}
                    onChange={(e) => setClearTicks(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900 text-rose-600 focus:ring-rose-500 focus:ring-offset-0"
                  />
                  <span>Also clear real-time spot/strike price ticks history</span>
                </label>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="p-4 border-t border-gray-800/80 bg-gray-950/40 flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-slate-300 font-medium text-xs transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-lg shadow-rose-600/30 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Purging...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" /> Purge & Reset Database
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
