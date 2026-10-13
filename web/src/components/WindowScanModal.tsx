import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  Download,
  ShieldAlert,
  Award,
} from 'lucide-react';
import {
  createChart,
  ColorType,
  LineSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';

export interface WindowTick {
  timestamp: number;
  upPrice: number;
  downPrice: number;
  priceToBeat: number;
  currentPrice: number;
  priceDelta: number;
  secondsRemaining: number | null;
  remainingTime: string | null;
}

export interface ModalPosition {
  id: string;
  mode?: string;
  marketSlug: string;
  question: string;
  outcome: 'YES' | 'NO';
  amountUsdc: number;
  entryPrice: number;
  strikePrice: number;
  entryBtcPrice: number;
  shares: number;
  entryTime: number;
  endTime: number;
  resolved: boolean;
  won?: boolean;
  payoutUsdc?: number;
  pnlUsdc?: number;
  secondsRemaining?: number;
  remainingTime?: string;
  windowScans?: WindowTick[];
}

interface WindowScanModalProps {
  position: ModalPosition | null;
  onClose: () => void;
}

export const WindowScanModal: React.FC<WindowScanModalProps> = ({ position, onClose }) => {
  const [ticks, setTicks] = useState<WindowTick[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'prices' | 'delta' | 'orderbook'>('prices');
  const [tableSearch, setTableSearch] = useState('');

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const spotSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const beatSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const deltaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const upSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const downSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Fetch window scans from API if not already attached
  useEffect(() => {
    if (!position) return;

    if (position.windowScans && position.windowScans.length > 0) {
      setTicks(position.windowScans);
      return;
    }

    setLoading(true);
    fetch(`/api/positions/${position.id}/window-scans`)
      .then((res) => res.json())
      .then((data: WindowTick[]) => {
        setTicks(data || []);
      })
      .catch((err) => {
        console.error('Failed to load window scans:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [position]);

  // Derived statistics
  const metrics = useMemo(() => {
    if (!ticks || ticks.length === 0 || !position) return null;

    const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
    const firstTick = sorted[0];
    const lastTick = sorted[sorted.length - 1];

    const deltas = sorted.map((t) => t.priceDelta);
    const maxDelta = Math.max(...deltas);
    const minDelta = Math.min(...deltas);

    const finalSpot = lastTick.currentPrice;
    const finalBeat = lastTick.priceToBeat || position.strikePrice;
    const finalDelta = +(finalSpot - finalBeat).toFixed(2);

    // Reversal detection: was it winning at bet time and then flipped?
    const entryDelta = position.entryBtcPrice - position.strikePrice;
    const isYes = position.outcome === 'YES';
    const entryFavorable = isYes ? entryDelta > 0 : entryDelta < 0;
    const finalFavorable = isYes ? finalDelta > 0 : finalDelta < 0;
    const experiencedReversal = entryFavorable && !finalFavorable;

    // Find tick where reversal happened
    let reversalTick: WindowTick | null = null;
    if (experiencedReversal) {
      for (const t of sorted) {
        if (t.timestamp >= position.entryTime) {
          const delta = t.currentPrice - t.priceToBeat;
          const favored = isYes ? delta > 0 : delta < 0;
          if (!favored) {
            reversalTick = t;
            break;
          }
        }
      }
    }

    return {
      firstTick,
      lastTick,
      maxDelta,
      minDelta,
      finalSpot,
      finalBeat,
      finalDelta,
      experiencedReversal,
      reversalTick,
      totalTicks: sorted.length,
    };
  }, [ticks, position]);

  // Build / update TradingView chart
  useEffect(() => {
    if (!chartContainerRef.current || !ticks || ticks.length === 0 || !position) return;

    // Clean up previous chart instance
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#090d16' },
        textColor: '#94a3b8',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        vertLine: { color: '#64748b', width: 1, style: 2 },
        horzLine: { color: '#64748b', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#334155',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 340,
    });

    chartRef.current = chart;

    // Sort ticks and ensure ascending unique UTC timestamps
    const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);
    const uniqueMap = new Map<number, WindowTick>();
    for (const t of sorted) {
      const sec = Math.floor(t.timestamp / 1000);
      uniqueMap.set(sec, t);
    }
    const cleanTicks = Array.from(uniqueMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, t]) => t);

    if (viewMode === 'prices') {
      const spotSeries = chart.addSeries(LineSeries, {
        color: '#06b6d4',
        lineWidth: 2,
        title: 'Spot BTC',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      const beatSeries = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
        lineStyle: 2, // Dashed line
        title: 'Price to Beat',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      spotSeriesRef.current = spotSeries;
      beatSeriesRef.current = beatSeries;

      const spotData = cleanTicks.map((t) => ({
        time: Math.floor(t.timestamp / 1000) as UTCTimestamp,
        value: t.currentPrice,
      }));

      const beatData = cleanTicks.map((t) => ({
        time: Math.floor(t.timestamp / 1000) as UTCTimestamp,
        value: t.priceToBeat || position.strikePrice,
      }));

      spotSeries.setData(spotData);
      beatSeries.setData(beatData);

      // Add bet entry marker if entry timestamp falls within or near the window
      const entrySec = Math.floor(position.entryTime / 1000);
      const closestTick = cleanTicks.reduce((prev, curr) => {
        return Math.abs(Math.floor(curr.timestamp / 1000) - entrySec) <
          Math.abs(Math.floor(prev.timestamp / 1000) - entrySec)
          ? curr
          : prev;
      }, cleanTicks[0]);

      if (closestTick) {
        const markerTime = Math.floor(closestTick.timestamp / 1000) as UTCTimestamp;
        // Set marker directly on series
        (spotSeries as any).setMarkers?.([
          {
            time: markerTime,
            position: position.outcome === 'YES' ? 'belowBar' : 'aboveBar',
            color: position.outcome === 'YES' ? '#10b981' : '#f43f5e',
            shape: position.outcome === 'YES' ? 'arrowUp' : 'arrowDown',
            text: `🎯 Bet ${position.outcome} ($${position.amountUsdc}) @ ${position.entryPrice * 100}¢`,
          },
        ]);
      }
    } else if (viewMode === 'delta') {
      const deltaSeries = chart.addSeries(AreaSeries, {
        lineColor: '#38bdf8',
        topColor: 'rgba(56, 189, 248, 0.35)',
        bottomColor: 'rgba(239, 68, 68, 0.35)',
        lineWidth: 2,
        title: 'Delta ($)',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });
      deltaSeriesRef.current = deltaSeries;

      const deltaData = cleanTicks.map((t) => ({
        time: Math.floor(t.timestamp / 1000) as UTCTimestamp,
        value: t.priceDelta,
      }));
      deltaSeries.setData(deltaData);
    } else if (viewMode === 'orderbook') {
      const upSeries = chart.addSeries(LineSeries, {
        color: '#10b981',
        lineWidth: 2,
        title: 'Up (YES ¢)',
      });
      const downSeries = chart.addSeries(LineSeries, {
        color: '#ef4444',
        lineWidth: 2,
        title: 'Down (NO ¢)',
      });
      upSeriesRef.current = upSeries;
      downSeriesRef.current = downSeries;

      const upData = cleanTicks.map((t) => ({
        time: Math.floor(t.timestamp / 1000) as UTCTimestamp,
        value: t.upPrice,
      }));
      const downData = cleanTicks.map((t) => ({
        time: Math.floor(t.timestamp / 1000) as UTCTimestamp,
        value: t.downPrice,
      }));

      upSeries.setData(upData);
      downSeries.setData(downData);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [ticks, viewMode, position]);

  // Export Window Ticks to CSV
  const handleExportCsv = () => {
    if (!ticks || ticks.length === 0 || !position) return;
    const headers = ['Timestamp', 'RemainingTime', 'SecondsRemaining', 'SpotBTC', 'PriceToBeat', 'Delta', 'UpPrice', 'DownPrice'];
    const rows = ticks.map((t) => [
      new Date(t.timestamp).toISOString(),
      t.remainingTime || '',
      t.secondsRemaining ?? '',
      t.currentPrice,
      t.priceToBeat,
      t.priceDelta,
      t.upPrice,
      t.downPrice,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `window_scan_${position.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!position) return null;

  const isLost = position.won === false;
  const filteredTicks = ticks.filter((t) => {
    if (!tableSearch) return true;
    const term = tableSearch.toLowerCase();
    return (
      (t.remainingTime && t.remainingTime.toLowerCase().includes(term)) ||
      t.currentPrice.toString().includes(term) ||
      t.priceDelta.toString().includes(term)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0b0f19] border border-gray-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-gray-800 bg-[#0f1422] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                isLost
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              }`}
            >
              {isLost ? <ShieldAlert className="w-6 h-6" /> : <Award className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    isLost
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {isLost ? 'LOST TRADE AUDIT' : 'WINNING TRADE AUDIT'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {new Date(position.entryTime).toLocaleTimeString()}
                </span>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-slate-300 font-mono">
                  {(position.mode || 'live').toUpperCase()}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                5-Minute Window Full Price Scan
                <span className="text-xs font-normal text-slate-400 font-mono">({position.marketSlug})</span>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700/80 hover:bg-gray-800 text-slate-300 text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Trade Context & Post-Mortem Explanation */}
        <div className="p-5 border-b border-gray-800/80 bg-[#090d16] space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Bet Outcome</span>
              <span
                className={`font-bold font-mono text-sm px-2 py-0.5 rounded ${
                  position.outcome === 'YES'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {position.outcome} ({position.entryPrice * 100}¢)
              </span>
            </div>

            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Bet Amount</span>
              <span className="font-bold font-mono text-sm text-slate-200">
                ${position.amountUsdc.toFixed(2)}
              </span>
            </div>

            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Strike (Beat) Price</span>
              <span className="font-bold font-mono text-sm text-purple-400">
                ${position.strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Entry Spot BTC</span>
              <span className="font-bold font-mono text-sm text-cyan-400">
                ${position.entryBtcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Final Spot BTC</span>
              <span
                className={`font-bold font-mono text-sm ${
                  metrics && metrics.finalSpot >= position.strikePrice ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {metrics ? `$${metrics.finalSpot.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A'}
              </span>
            </div>

            <div className="bg-[#111625] p-3 rounded-xl border border-gray-800/80">
              <span className="text-slate-400 block mb-1">Net PnL</span>
              <span
                className={`font-bold font-mono text-sm ${
                  isLost ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {isLost ? `-$${position.amountUsdc.toFixed(2)}` : `+$${(position.pnlUsdc || 0).toFixed(2)}`}
              </span>
            </div>
          </div>

          {/* Post-Mortem Audit Box */}
          {isLost && metrics && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-200 leading-relaxed">
                <span className="font-semibold text-rose-300">Post-Mortem Root Cause Analysis: </span>
                Betted <span className="font-mono font-bold text-white">{position.outcome}</span> expecting price to expire{' '}
                {position.outcome === 'YES' ? 'ABOVE' : 'BELOW'} strike price of{' '}
                <span className="font-mono font-bold text-white">${position.strikePrice.toFixed(2)}</span>.
                At entry, spot was{' '}
                <span className="font-mono font-bold text-white">${position.entryBtcPrice.toFixed(2)}</span>{' '}
                (Delta: {position.entryBtcPrice - position.strikePrice >= 0 ? '+' : ''}$
                {(position.entryBtcPrice - position.strikePrice).toFixed(2)}).
                However, price concluded at{' '}
                <span className="font-mono font-bold text-white">${metrics.finalSpot.toFixed(2)}</span>{' '}
                (Final Delta: {metrics.finalDelta >= 0 ? '+' : ''}${metrics.finalDelta.toFixed(2)}),{' '}
                resulting in a complete expiration loss.
                {metrics.experiencedReversal && metrics.reversalTick && (
                  <span className="block mt-1 font-medium text-rose-300">
                    ⚡ Market reversed against position around countdown {metrics.reversalTick.remainingTime || 'unknown'} (
                    {metrics.reversalTick.secondsRemaining}s remaining).
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Chart View Switcher */}
        <div className="px-5 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 bg-[#090d16]">
          <div className="flex items-center gap-1.5 p-1 bg-gray-900 border border-gray-800 rounded-xl">
            <button
              onClick={() => setViewMode('prices')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'prices'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Price Trajectory (BTC vs Beat)
            </button>
            <button
              onClick={() => setViewMode('delta')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'delta'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Price Delta ($ Spread)
            </button>
            <button
              onClick={() => setViewMode('orderbook')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === 'orderbook'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              DOM Orderbook (Up ¢ vs Down ¢)
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            {metrics && (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Spot
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span> Beat Strike
                </span>
                <span className="font-mono text-slate-500">
                  {metrics.totalTicks} scans captured
                </span>
              </>
            )}
          </div>
        </div>

        {/* Chart Container */}
        <div className="p-5 bg-[#090d16] flex-1">
          {loading ? (
            <div className="h-[340px] flex items-center justify-center text-slate-500 text-sm">
              Loading window scans...
            </div>
          ) : (
            <div ref={chartContainerRef} className="w-full rounded-xl overflow-hidden border border-gray-800" />
          )}
        </div>

        {/* Tick-by-Tick Table */}
        <div className="border-t border-gray-800 bg-[#0c101c] flex-1 flex flex-col min-h-[180px] max-h-[240px]">
          <div className="p-3 px-5 border-b border-gray-800/80 flex items-center justify-between gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Window Scan Log ({filteredTicks.length} ticks)
            </h3>
            <input
              type="text"
              placeholder="Filter by time, price, delta..."
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-cyan-500 w-56"
            />
          </div>

          <div className="overflow-y-auto flex-1 text-xs">
            <table className="w-full text-left">
              <thead className="bg-[#090d16] text-slate-400 sticky top-0 border-b border-gray-800">
                <tr>
                  <th className="py-2 px-4">#</th>
                  <th className="py-2 px-4">Time</th>
                  <th className="py-2 px-4">Countdown</th>
                  <th className="py-2 px-4">Spot BTC</th>
                  <th className="py-2 px-4">Price to Beat</th>
                  <th className="py-2 px-4">Delta</th>
                  <th className="py-2 px-4">Up / Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono text-slate-300">
                {filteredTicks.map((tick, idx) => {
                  const isFavorable = position.outcome === 'YES' ? tick.priceDelta >= 0 : tick.priceDelta <= 0;
                  return (
                    <tr key={idx} className="hover:bg-gray-900/40">
                      <td className="py-1.5 px-4 text-slate-500">{idx + 1}</td>
                      <td className="py-1.5 px-4 text-slate-400">
                        {new Date(tick.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-1.5 px-4 font-semibold text-slate-200">
                        {tick.remainingTime || `${tick.secondsRemaining ?? '--'}s`}
                      </td>
                      <td className="py-1.5 px-4 text-cyan-300">${tick.currentPrice.toFixed(2)}</td>
                      <td className="py-1.5 px-4 text-purple-300">${tick.priceToBeat.toFixed(2)}</td>
                      <td className={`py-1.5 px-4 font-bold ${isFavorable ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tick.priceDelta >= 0 ? '+' : ''}${tick.priceDelta.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-4 text-slate-400">
                        {tick.upPrice}¢ / {tick.downPrice}¢
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
