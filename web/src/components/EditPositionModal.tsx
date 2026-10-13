import React, { useState } from 'react';
import {
  X,
  Trash2,
  Save,
  Copy,
  CheckCheck,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  AlertTriangle,
  Loader2,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { Position } from '../App';

interface EditPositionModalProps {
  isOpen: boolean;
  position: Position | null;
  onClose: () => void;
  onSave: (updated: Position) => void;
  onDelete?: (id: string) => void;
}

const formatDateTimeLocal = (timestamp: number | undefined): string => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
};

const EditPositionDialog: React.FC<{
  position: Position;
  onClose: () => void;
  onSave: (updated: Position) => void;
  onDelete?: (id: string) => void;
}> = ({ position, onClose, onSave, onDelete }) => {
  const [copiedId, setCopiedId] = useState(false);
  const [outcome, setOutcome] = useState<'YES' | 'NO'>(position.outcome);
  const [mode, setMode] = useState<string>(position.mode || 'live');
  const [resultState, setResultState] = useState<'OPEN' | 'WON' | 'LOST'>(() => {
    if (!position.resolved) return 'OPEN';
    return position.won ? 'WON' : 'LOST';
  });

  const [amountUsdc, setAmountUsdc] = useState<string>(
    position.amountUsdc?.toString() ?? '10'
  );
  const [entryPrice, setEntryPrice] = useState<string>(
    position.entryPrice?.toString() ?? '0.95'
  );
  const [shares, setShares] = useState<string>(
    position.shares?.toFixed(4) ?? '10.5263'
  );
  const [strikePrice, setStrikePrice] = useState<string>(
    position.strikePrice?.toString() ?? '0'
  );
  const [entryBtcPrice, setEntryBtcPrice] = useState<string>(
    position.entryBtcPrice?.toString() ?? '0'
  );
  const [payoutUsdc, setPayoutUsdc] = useState<string>(
    position.payoutUsdc !== undefined ? position.payoutUsdc.toString() : '0'
  );
  const [pnlUsdc, setPnlUsdc] = useState<string>(
    position.pnlUsdc !== undefined ? position.pnlUsdc.toString() : '0'
  );
  const [remainingTime, setRemainingTime] = useState<string>(position.remainingTime || '');
  const [secondsRemaining, setSecondsRemaining] = useState<string>(
    position.secondsRemaining !== undefined ? position.secondsRemaining.toString() : ''
  );
  const [question, setQuestion] = useState<string>(position.question || '');
  const [marketSlug, setMarketSlug] = useState<string>(position.marketSlug || '');
  const [entryDateString, setEntryDateString] = useState<string>(() =>
    formatDateTimeLocal(position.entryTime)
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopyId = () => {
    navigator.clipboard.writeText(position.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Auto calculate defaults when switching result status
  const handleResultChange = (newResult: 'OPEN' | 'WON' | 'LOST') => {
    setResultState(newResult);
    const amt = parseFloat(amountUsdc) || 0;
    const ep = parseFloat(entryPrice) || 0.95;
    const computedShares = ep > 0 ? amt / ep : amt;

    if (newResult === 'WON') {
      const payout = parseFloat(computedShares.toFixed(2));
      const pnl = parseFloat((payout - amt).toFixed(2));
      setPayoutUsdc(payout.toString());
      setPnlUsdc(pnl.toString());
    } else if (newResult === 'LOST') {
      setPayoutUsdc('0');
      setPnlUsdc((-amt).toFixed(2));
    } else {
      setPayoutUsdc('');
      setPnlUsdc('');
    }
  };

  // Auto calculate shares & recalculate pnl when amount or entryPrice changes
  const handleAmountChange = (newAmt: string) => {
    setAmountUsdc(newAmt);
    const amt = parseFloat(newAmt);
    const ep = parseFloat(entryPrice);
    if (!isNaN(amt) && !isNaN(ep) && ep > 0) {
      const newShares = amt / ep;
      setShares(newShares.toFixed(4));
      if (resultState === 'WON') {
        const payout = parseFloat(newShares.toFixed(2));
        setPayoutUsdc(payout.toString());
        setPnlUsdc((payout - amt).toFixed(2));
      } else if (resultState === 'LOST') {
        setPayoutUsdc('0');
        setPnlUsdc((-amt).toFixed(2));
      }
    }
  };

  const handleEntryPriceChange = (newEp: string) => {
    setEntryPrice(newEp);
    const amt = parseFloat(amountUsdc);
    const ep = parseFloat(newEp);
    if (!isNaN(amt) && !isNaN(ep) && ep > 0) {
      const newShares = amt / ep;
      setShares(newShares.toFixed(4));
      if (resultState === 'WON') {
        const payout = parseFloat(newShares.toFixed(2));
        setPayoutUsdc(payout.toString());
        setPnlUsdc((payout - amt).toFixed(2));
      }
    }
  };

  const handleQuickRecalc = () => {
    const amt = parseFloat(amountUsdc) || 0;
    const ep = parseFloat(entryPrice) || 0.95;
    const computedShares = ep > 0 ? amt / ep : amt;
    setShares(computedShares.toFixed(4));

    if (resultState === 'WON') {
      const payout = parseFloat(computedShares.toFixed(2));
      setPayoutUsdc(payout.toString());
      setPnlUsdc((payout - amt).toFixed(2));
    } else if (resultState === 'LOST') {
      setPayoutUsdc('0');
      setPnlUsdc((-amt).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const amt = parseFloat(amountUsdc);
      const ep = parseFloat(entryPrice);
      const sh = parseFloat(shares);
      const sp = parseFloat(strikePrice);
      const spot = parseFloat(entryBtcPrice);
      const secRem = secondsRemaining !== '' ? parseInt(secondsRemaining, 10) : undefined;

      const isResolved = resultState !== 'OPEN';
      const isWon = resultState === 'WON' ? true : resultState === 'LOST' ? false : undefined;
      const payout = isResolved && payoutUsdc !== '' ? parseFloat(payoutUsdc) : undefined;
      const pnl = isResolved && pnlUsdc !== '' ? parseFloat(pnlUsdc) : undefined;

      let entryTs = position.entryTime;
      if (entryDateString) {
        const parsedTs = new Date(entryDateString).getTime();
        if (!isNaN(parsedTs)) {
          entryTs = parsedTs;
        }
      }

      const payload: Partial<Position> = {
        outcome,
        mode,
        amountUsdc: isNaN(amt) ? 0 : amt,
        entryPrice: isNaN(ep) ? 0.95 : ep,
        shares: isNaN(sh) ? 0 : sh,
        strikePrice: isNaN(sp) ? 0 : sp,
        entryBtcPrice: isNaN(spot) ? 0 : spot,
        resolved: isResolved,
        won: isWon,
        payoutUsdc: payout,
        pnlUsdc: pnl,
        remainingTime: remainingTime || undefined,
        secondsRemaining: secRem,
        entryTime: entryTs,
        question: question || undefined,
        marketSlug: marketSlug || undefined,
      };

      const res = await fetch(`/api/positions/${position.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update position');
      }

      onSave(data.position || { ...position, ...payload });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error updating position');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/positions/${position.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to delete position');
      }

      if (onDelete) {
        onDelete(position.id);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error deleting position');
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="bg-[#0f1422] border border-blue-500/30 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl shadow-blue-950/40 relative">
      {/* Modal Header */}
      <div className="p-4 sm:p-5 border-b border-gray-800/80 bg-blue-500/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
            <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Edit Trade Position
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                {mode}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                ID: {position.id}
              </span>
              <button
                type="button"
                onClick={handleCopyId}
                className="text-slate-400 hover:text-white p-0.5 transition-colors"
                title="Copy ID"
              >
                {copiedId ? (
                  <CheckCheck className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Modal Body / Form */}
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Top Outcome & Result Status Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-900/40 border border-gray-800">
          {/* Outcome Selection */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Bet Outcome Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome('YES')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
                  outcome === 'YES'
                    ? 'bg-emerald-500 text-gray-950 shadow-md shadow-emerald-500/30 font-black'
                    : 'bg-gray-950 text-slate-300 border border-gray-800 hover:border-emerald-500/40'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                YES
              </button>
              <button
                type="button"
                onClick={() => setOutcome('NO')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
                  outcome === 'NO'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 font-black'
                    : 'bg-gray-950 text-slate-300 border border-gray-800 hover:border-rose-500/40'
                }`}
              >
                <TrendingDown className="w-3.5 h-3.5" />
                NO
              </button>
            </div>
          </div>

          {/* Result Status Selection */}
          <div>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Result Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleResultChange('OPEN')}
                className={`py-2 px-2 rounded-xl text-center font-bold text-[11px] transition-all ${
                  resultState === 'OPEN'
                    ? 'bg-amber-500 text-gray-950 font-black shadow-md shadow-amber-500/30'
                    : 'bg-gray-950 text-slate-300 border border-gray-800 hover:border-amber-500/40'
                }`}
              >
                OPEN ⏳
              </button>
              <button
                type="button"
                onClick={() => handleResultChange('WON')}
                className={`py-2 px-2 rounded-xl text-center font-bold text-[11px] transition-all ${
                  resultState === 'WON'
                    ? 'bg-emerald-500 text-gray-950 font-black shadow-md shadow-emerald-500/30'
                    : 'bg-gray-950 text-slate-300 border border-gray-800 hover:border-emerald-500/40'
                }`}
              >
                WON 🏆
              </button>
              <button
                type="button"
                onClick={() => handleResultChange('LOST')}
                className={`py-2 px-2 rounded-xl text-center font-bold text-[11px] transition-all ${
                  resultState === 'LOST'
                    ? 'bg-rose-500 text-white font-black shadow-md shadow-rose-500/30'
                    : 'bg-gray-950 text-slate-300 border border-gray-800 hover:border-rose-500/40'
                }`}
              >
                LOST ❌
              </button>
            </div>
          </div>
        </div>

        {/* Section: Bet & Financial Details */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-blue-400" />
              Financial & Trade Stakes
            </h4>
            <button
              type="button"
              onClick={handleQuickRecalc}
              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
              title="Recalculate shares and PnL from Bet & Entry Price"
            >
              <Sparkles className="w-3 h-3" />
              Auto-Calculate
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Bet Amount */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Bet Amount ($ USDC)</label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amountUsdc}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="10.00"
                  required
                />
              </div>
            </div>

            {/* Entry Price */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Entry Price ($ / share)</label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  max="1"
                  value={entryPrice}
                  onChange={(e) => handleEntryPriceChange(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="0.95"
                  required
                />
              </div>
            </div>

            {/* Shares */}
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Shares Count</label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="10.52"
                  required
                />
              </div>
            </div>
          </div>

          {/* Payout and PnL fields (when resolved) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Payout ($ USDC) {resultState === 'OPEN' ? '(Pending resolution)' : ''}
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={payoutUsdc}
                  onChange={(e) => setPayoutUsdc(e.target.value)}
                  disabled={resultState === 'OPEN'}
                  className="bg-transparent text-white font-mono w-full focus:outline-none disabled:opacity-40"
                  placeholder={resultState === 'OPEN' ? 'N/A' : '0.00'}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Net PnL ($ USDC) {resultState === 'OPEN' ? '(Pending resolution)' : ''}
              </label>
              <div
                className={`flex items-center bg-gray-950 border focus-within:border-blue-500 rounded-xl px-2.5 py-1.5 ${
                  resultState === 'WON'
                    ? 'border-emerald-500/40 text-emerald-400'
                    : resultState === 'LOST'
                    ? 'border-rose-500/40 text-rose-400'
                    : 'border-gray-800 text-slate-400'
                }`}
              >
                <span className="font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={pnlUsdc}
                  onChange={(e) => setPnlUsdc(e.target.value)}
                  disabled={resultState === 'OPEN'}
                  className="bg-transparent font-mono w-full focus:outline-none disabled:opacity-40"
                  placeholder={resultState === 'OPEN' ? 'N/A' : '0.00'}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Price Reference Targets */}
        <div>
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            BTC Price Targets
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Price To Beat / Strike Price ($)
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={strikePrice}
                  onChange={(e) => setStrikePrice(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="95000.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Entry Spot BTC Price ($)
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <span className="text-slate-500 font-mono mr-1">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={entryBtcPrice}
                  onChange={(e) => setEntryBtcPrice(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="94980.00"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Timestamps & Timing */}
        <div>
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Timing & Window Metrics
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Remaining Time Label
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <input
                  type="text"
                  value={remainingTime}
                  onChange={(e) => setRemainingTime(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="15s"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Seconds Remaining
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <input
                  type="number"
                  value={secondsRemaining}
                  onChange={(e) => setSecondsRemaining(e.target.value)}
                  className="bg-transparent text-white font-mono w-full focus:outline-none"
                  placeholder="15"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">
                Entry Date & Time
              </label>
              <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-2.5 py-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500 mr-1.5 shrink-0" />
                <input
                  type="datetime-local"
                  value={entryDateString}
                  onChange={(e) => setEntryDateString(e.target.value)}
                  className="bg-transparent text-white text-[11px] w-full focus:outline-none font-sans"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section: Mode, Question & Market Slug */}
        <div className="pt-2 border-t border-gray-800/80">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Trading Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 text-slate-300 focus:outline-none focus:border-blue-500"
              >
                <option value="live">live</option>
                <option value="dry-run">dry-run</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Market Slug</label>
              <input
                type="text"
                value={marketSlug}
                onChange={(e) => setMarketSlug(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 text-slate-300 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                placeholder="btc-5m-..."
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Market Question</label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1.5 text-slate-300 text-[11px] focus:outline-none focus:border-blue-500"
                placeholder="Will Bitcoin be above..."
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Delete button with safety confirmation */}
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  confirmDelete
                    ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {confirmDelete ? 'Confirm Permanent Delete?' : 'Delete Position'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/25 flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export const EditPositionModal: React.FC<EditPositionModalProps> = ({
  isOpen,
  position,
  onClose,
  onSave,
  onDelete,
}) => {
  if (!isOpen || !position) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <EditPositionDialog
        key={position.id}
        position={position}
        onClose={onClose}
        onSave={onSave}
        onDelete={onDelete}
      />
    </div>
  );
};
