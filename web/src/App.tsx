import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  DollarSign,
  Clock,
  RefreshCw,
  Search,
  Download,
  Flame,
  Radio,
  Layers,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Zap,
  Calendar,
  X,
  Trash2,
  Square,
  Play,
  SlidersHorizontal,
  Octagon,
} from 'lucide-react';
import { PnLChart } from './components/PnLChart';
import { PriceTicksChart } from './components/PriceTicksChart';
import { WindowScanModal } from './components/WindowScanModal';
import { ResetDbModal } from './components/ResetDbModal';

interface Position {
  id: string;
  mode: string;
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
}

interface Stats {
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
  openTrades: number;
  winRate: number;
  totalWagered: number;
  totalPayout: number;
  netPnL: number;
}

interface Tick {
  id: number;
  timestamp: number;
  upPrice: number;
  downPrice: number;
  priceToBeat: number;
  currentPrice: number;
  priceDelta: number;
  secondsRemaining?: number | null;
  remainingTime?: string | null;
  balance?: string | null;
}

export function App() {
  const [mode, setMode] = useState<'live' | 'dry-run' | 'all'>('live');
  const [stats, setStats] = useState<Stats | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [pnlHistory, setPnlHistory] = useState<any[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [lastTick, setLastTick] = useState<any>(null);
  const [botStatus, setBotStatus] = useState<any>({ running: false });
  const [activeChartTab, setActiveChartTab] = useState<'pnl' | 'ticks'>('pnl');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showResetDbModal, setShowResetDbModal] = useState(false);
  const [updatingBetControl, setUpdatingBetControl] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [stopBalanceInput, setStopBalanceInput] = useState<string>('');

  // Table filters & pagination
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL');
  const [resultFilter, setResultFilter] = useState<'ALL' | 'WON' | 'LOST' | 'OPEN'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);

  // Date filters
  const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | '7D' | '30D' | 'CUSTOM'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Calculate start and end timestamp ranges
  const { startTs, endTs } = useMemo(() => {
    let start: number | undefined = undefined;
    let end: number | undefined = undefined;

    const now = new Date();

    if (datePreset === 'TODAY') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const todayEnd = todayStart + 86400000 - 1;
      start = todayStart;
      end = todayEnd;
    } else if (datePreset === 'YESTERDAY') {
      const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yestStart = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate()).getTime();
      const yestEnd = yestStart + 86400000 - 1;
      start = yestStart;
      end = yestEnd;
    } else if (datePreset === '7D') {
      const d7 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      start = new Date(d7.getFullYear(), d7.getMonth(), d7.getDate()).getTime();
      end = now.getTime();
    } else if (datePreset === '30D') {
      const d30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      start = new Date(d30.getFullYear(), d30.getMonth(), d30.getDate()).getTime();
      end = now.getTime();
    } else if (datePreset === 'CUSTOM') {
      if (startDate) {
        start = new Date(`${startDate}T00:00:00`).getTime();
      }
      if (endDate) {
        end = new Date(`${endDate}T23:59:59.999`).getTime();
      }
    }
    return { startTs: start, endTs: end };
  }, [datePreset, startDate, endDate]);

  const dateSummary = useMemo(() => {
    if (datePreset === 'ALL') return null;
    if (datePreset === 'TODAY') return 'Today';
    if (datePreset === 'YESTERDAY') return 'Yesterday';
    if (datePreset === '7D') return 'Last 7 Days';
    if (datePreset === '30D') return 'Last 30 Days';
    if (datePreset === 'CUSTOM') {
      if (startDate && endDate) return `${startDate} → ${endDate}`;
      if (startDate) return `From ${startDate}`;
      if (endDate) return `Until ${endDate}`;
      return 'Custom Range';
    }
    return null;
  }, [datePreset, startDate, endDate]);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('mode', mode);
      if (startTs !== undefined) q.set('startDate', startTs.toString());
      if (endTs !== undefined) q.set('endDate', endTs.toString());
      const qs = q.toString();

      const [statsRes, posRes, pnlRes, ticksRes, statusRes] = await Promise.all([
        fetch(`/api/stats?${qs}`).then((r) => r.json()),
        fetch(`/api/positions?${qs}&limit=500`).then((r) => r.json()),
        fetch(`/api/pnl-history?${qs}`).then((r) => r.json()),
        fetch('/api/ticks?limit=200').then((r) => r.json()),
        fetch('/api/status').then((r) => r.json()),
      ]);

      setStats(statsRes);
      setPositions(posRes);
      setPnlHistory(pnlRes);
      setTicks(ticksRes);
      if (statusRes.lastTick) setLastTick(statusRes.lastTick);
      if (statusRes.status) setBotStatus(statusRes.status);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleBetControl = async () => {
    const nextState = botStatus?.bettingEnabled === false ? true : false;
    setUpdatingBetControl(true);
    try {
      const res = await fetch('/api/bot/bet-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (data.ok) {
        setBotStatus((prev: any) => ({
          ...prev,
          bettingEnabled: data.bettingEnabled,
          stopReason: data.stopReason,
        }));
      }
    } catch (err) {
      console.error('Failed to toggle bot bet:', err);
    } finally {
      setUpdatingBetControl(false);
    }
  };

  const handleSaveStopBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(stopBalanceInput);
    if (isNaN(val) || val < 0) return;
    try {
      const res = await fetch('/api/bot/bet-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stopAtBalance: val }),
      });
      const data = await res.json();
      if (data.ok) {
        setBotStatus((prev: any) => ({
          ...prev,
          stopAtBalance: data.stopAtBalance,
        }));
        setShowBalanceModal(false);
      }
    } catch (err) {
      console.error('Failed to update stop balance:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [mode, startTs, endTs]);

  // Real-time SSE listener and background syncing
  useEffect(() => {
    const eventSource = new EventSource(`/api/stream?mode=${mode}`);

    eventSource.onopen = () => {
      setSseConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.status) setBotStatus(payload.status);
        if (payload.stats && datePreset === 'ALL') setStats(payload.stats);
        if (payload.lastTick) {
          setLastTick(payload.lastTick);
          setTicks((prev) => {
            const next = [
              ...prev,
              {
                id: Date.now(),
                timestamp: payload.lastTick.timestamp || Date.now(),
                upPrice: payload.lastTick.upPrice,
                downPrice: payload.lastTick.downPrice,
                priceToBeat: payload.lastTick.priceToBeat,
                currentPrice: payload.lastTick.currentPrice,
                priceDelta: payload.lastTick.priceDelta,
                secondsRemaining: payload.lastTick.secondsRemaining,
                remainingTime: payload.lastTick.countdownStr,
                balance: payload.lastTick.balance,
              },
            ];
            return next.slice(-200);
          });
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    eventSource.onerror = () => {
      setSseConnected(false);
    };

    // Periodic sync for positions & stats (every 3.5s) to guarantee new trades appear automatically
    const syncInterval = setInterval(() => {
      const q = new URLSearchParams();
      q.set('mode', mode);
      if (startTs !== undefined) q.set('startDate', startTs.toString());
      if (endTs !== undefined) q.set('endDate', endTs.toString());
      const qs = q.toString();

      fetch(`/api/positions?${qs}&limit=500`)
        .then((r) => r.json())
        .then((data) => setPositions(data))
        .catch(() => {});
      fetch(`/api/stats?${qs}`)
        .then((r) => r.json())
        .then((data) => setStats(data))
        .catch(() => {});
      fetch(`/api/status`)
        .then((r) => r.json())
        .then((data) => {
          if (data.status) setBotStatus(data.status);
          if (data.lastTick) setLastTick(data.lastTick);
        })
        .catch(() => {});
    }, 3500);

    return () => {
      eventSource.close();
      clearInterval(syncInterval);
    };
  }, [mode, startTs, endTs]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return positions.filter((pos) => {
      if (outcomeFilter !== 'ALL' && pos.outcome !== outcomeFilter) return false;
      if (resultFilter === 'WON' && (!pos.resolved || !pos.won)) return false;
      if (resultFilter === 'LOST' && (!pos.resolved || pos.won)) return false;
      if (resultFilter === 'OPEN' && pos.resolved) return false;
      if (startTs !== undefined && pos.entryTime < startTs) return false;
      if (endTs !== undefined && pos.entryTime > endTs) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchesId = pos.id.toLowerCase().includes(q);
        const matchesStrike = pos.strikePrice.toString().includes(q);
        const matchesEntry = pos.entryBtcPrice.toString().includes(q);
        return matchesId || matchesStrike || matchesEntry;
      }
      return true;
    });
  }, [positions, outcomeFilter, resultFilter, search, startTs, endTs]);

  const totalPages = Math.ceil(filteredPositions.length / pageSize) || 1;
  const paginatedPositions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredPositions.slice(start, start + pageSize);
  }, [filteredPositions, page, pageSize]);

  // Export CSV
  const exportCsv = () => {
    const exportList = filteredPositions.length > 0 ? filteredPositions : positions;
    if (exportList.length === 0) return;
    const headers = [
      'ID',
      'Time',
      'Remaining Time',
      'Outcome',
      'Bet Amount ($)',
      'Price To Beat ($)',
      'Entry Price ($)',
      'Result',
      'PnL ($)',
    ];
    const rows = positions.map((p) => [
      p.id,
      new Date(p.entryTime).toISOString(),
      p.remainingTime || (p.secondsRemaining ? `${p.secondsRemaining}s` : ''),
      p.outcome,
      p.amountUsdc,
      p.strikePrice,
      p.entryBtcPrice,
      p.resolved ? (p.won ? 'WON' : 'LOST') : 'OPEN',
      p.pnlUsdc ?? 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `polymarket_btc5m_${mode}_trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isPositivePnL = (stats?.netPnL || 0) >= 0;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="border-b border-gray-800 bg-[#0e1322]/80 backdrop-blur-md sticky top-0 z-50 px-3 sm:px-4 lg:px-8 py-2.5 sm:py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white whitespace-nowrap">BTC 5M DOM Sniper</h1>
                  <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    SQLite v1.0
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 hidden xs:block">Polymarket Pure DOM Trading & Analytics</p>
              </div>
            </div>

            {/* Quick Action Group on Mobile */}
            <div className="flex items-center gap-1.5 sm:hidden">
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-slate-300 hover:text-white transition-all disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowResetDbModal(true)}
                className="p-1.5 rounded-lg bg-gray-900 hover:bg-rose-950/40 border border-gray-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-all"
                title="Reset SQLite Database"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              </button>
            </div>
          </div>

          {/* Mode Switcher & Real-time Status */}
          <div className="flex items-center flex-wrap gap-2 sm:gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {/* Live SSE Pulse */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs">
              <span className="relative flex h-2 w-2">
                {sseConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    sseConnected ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                ></span>
              </span>
              <span className="text-slate-300 font-medium">
                <span className="hidden sm:inline">{sseConnected ? 'Realtime Connected' : 'Disconnected'}</span>
                <span className="sm:hidden">{sseConnected ? 'Live' : 'Off'}</span>
              </span>
            </div>

            {/* Stop / Resume Bot Bet Button */}
            <button
              onClick={toggleBetControl}
              disabled={updatingBetControl}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md disabled:opacity-50 ${
                botStatus?.bettingEnabled !== false
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 animate-pulse'
              }`}
              title={
                botStatus?.bettingEnabled !== false
                  ? 'Stop automated betting (keep scanner running)'
                  : 'Resume automated betting'
              }
            >
              {botStatus?.bettingEnabled !== false ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Bot Bet
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" /> Resume Bot Bet
                </>
              )}
            </button>

            {/* Stop at Balance Config Button */}
            <button
              onClick={() => {
                setStopBalanceInput(String(botStatus?.stopAtBalance ?? 0));
                setShowBalanceModal(true);
              }}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-gray-900 border border-gray-800 hover:border-blue-500/50 text-slate-300 hover:text-white text-xs font-medium transition-all"
              title="Set minimum account balance threshold to automatically halt betting"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden xs:inline text-slate-400">Stop at:</span>
              <strong className="text-amber-400 font-mono">
                {botStatus?.stopAtBalance && botStatus.stopAtBalance > 0
                  ? `$${botStatus.stopAtBalance}`
                  : 'Off'}
              </strong>
            </button>

            {/* Mode Tabs */}
            <div className="flex p-0.5 sm:p-1 rounded-xl bg-gray-900 border border-gray-800">
              <button
                onClick={() => setMode('live')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'live'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" /> Live
              </button>
              <button
                onClick={() => setMode('dry-run')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'dry-run'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Paper
              </button>
              <button
                onClick={() => setMode('all')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === 'all' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> All
              </button>
            </div>

            {/* Desktop Refresh & Reset Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={fetchData}
                disabled={loading}
                className="p-2 rounded-lg bg-gray-900 hover:bg-gray-800 border border-gray-800 text-slate-300 hover:text-white transition-all disabled:opacity-50"
                title="Refresh Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowResetDbModal(true)}
                className="p-2 rounded-lg bg-gray-900 hover:bg-rose-950/40 border border-gray-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 transition-all"
                title="Reset SQLite Database"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto w-full px-3 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 flex-1">
        {/* Betting Paused Warning Banner */}
        {botStatus?.bettingEnabled === false && (
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 animate-in fade-in shadow-xl shadow-rose-950/30">
            <div className="flex items-center gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0">
                <Octagon className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white">Automated Betting is Stopped</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
                    Scanner Active
                  </span>
                </div>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  {botStatus?.stopReason || 'The bot is only scanning DOM prices and will NOT place bets.'}
                </p>
              </div>
            </div>
            <button
              onClick={toggleBetControl}
              disabled={updatingBetControl}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-600/30 w-full sm:w-auto"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Resume Bot Bet
            </button>
          </div>
        )}

        {/* Real-time Round Banner */}
        {lastTick && (
          <div className="bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-blue-500/20 rounded-2xl p-3.5 sm:p-4 shadow-xl backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
              <div className="p-2 sm:p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0 mt-0.5 sm:mt-0">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                    Live 5M Round Scanner
                  </span>
                  {lastTick.balance && (
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Balance: {lastTick.balance}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 mt-1 text-xs sm:text-sm">
                  <span>
                    Spot:{' '}
                    <strong className="text-white font-mono font-semibold">
                      ${lastTick.currentPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                  <span className="text-slate-600 hidden xs:inline">•</span>
                  <span>
                    Strike:{' '}
                    <strong className="text-amber-300 font-mono font-semibold">
                      ${lastTick.priceToBeat?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                  <span className="text-slate-600 hidden xs:inline">•</span>
                  <span>
                    Delta:{' '}
                    <strong
                      className={`font-mono font-bold ${
                        Number(lastTick.priceDelta) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {Number(lastTick.priceDelta) >= 0 ? '+' : ''}${lastTick.priceDelta}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Live Countdown & Odds Block */}
            <div className="flex items-center justify-between md:justify-end gap-2.5 sm:gap-3 w-full md:w-auto pt-2.5 md:pt-0 border-t md:border-t-0 border-blue-500/10">
              {/* Live Countdown Badge - NO "Round countdown" label */}
              <div className="flex items-center gap-2 bg-gray-900/90 border border-amber-500/30 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl shadow-inner">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-base sm:text-lg font-mono font-extrabold text-amber-300 tracking-wider">
                  {lastTick.countdownStr || `${lastTick.secondsRemaining || 0}s`}
                </span>
              </div>

              {/* DOM Buttons Odds */}
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold text-center min-w-[52px]">
                  <div className="text-[9px] uppercase font-semibold text-emerald-400/70">UP</div>
                  {lastTick.upPrice}¢
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-400 font-mono text-xs font-bold text-center min-w-[52px]">
                  <div className="text-[9px] uppercase font-semibold text-rose-400/70">DOWN</div>
                  {lastTick.downPrice}¢
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Net Realized PnL */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3.5 sm:p-5 hover:border-gray-700 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span className="truncate pr-1">Net Realized PnL</span>
                <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${isPositivePnL ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {isPositivePnL ? <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
                <span
                  className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                    isPositivePnL ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositivePnL ? '+' : ''}${stats?.netPnL?.toFixed(2) || '0.00'}
                </span>
                <span className="text-[10px] sm:text-xs text-slate-500 font-medium">USDC</span>
              </div>
            </div>
            <div className="mt-2.5 sm:mt-3 text-[11px] sm:text-xs text-slate-400 flex flex-wrap items-center justify-between border-t border-gray-800/80 pt-2 gap-1">
              <span>Wager: ${stats?.totalWagered?.toLocaleString() || '0'}</span>
              <span>Payout: ${stats?.totalPayout?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}</span>
            </div>
          </div>

          {/* Win Rate */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3.5 sm:p-5 hover:border-gray-700 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span className="truncate pr-1">Win Rate</span>
                <div className="p-1.5 sm:p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
                  <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                  {stats?.winRate?.toFixed(1) || '0.0'}%
                </span>
                <span className="text-[10px] sm:text-xs text-emerald-400 font-semibold">
                  {stats?.wonTrades || 0}W
                </span>
                <span className="text-[10px] sm:text-xs text-slate-500">/</span>
                <span className="text-[10px] sm:text-xs text-rose-400 font-semibold">
                  {stats?.lostTrades || 0}L
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-2.5 sm:mt-3 w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full"
                style={{ width: `${Math.min(stats?.winRate || 0, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Total Trades */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3.5 sm:p-5 hover:border-gray-700 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span className="truncate pr-1">Total Trades</span>
                <div className="p-1.5 sm:p-2 rounded-xl bg-blue-500/10 text-blue-400 shrink-0">
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                  {stats?.totalTrades?.toLocaleString() || '0'}
                </span>
                {stats?.openTrades ? (
                  <span className="text-[10px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/20">
                    {stats.openTrades} Open ⏳
                  </span>
                ) : (
                  <span className="text-[10px] sm:text-xs text-slate-500 font-medium">Settled</span>
                )}
              </div>
            </div>
            <div className="mt-2.5 sm:mt-3 text-[11px] sm:text-xs text-slate-400 border-t border-gray-800/80 pt-2 flex flex-wrap items-center justify-between gap-1">
              <span>Avg: ${stats && stats.totalTrades > 0 ? (stats.totalWagered / stats.totalTrades).toFixed(0) : '0'}</span>
              <span className="text-slate-500 capitalize">{mode}</span>
            </div>
          </div>

          {/* Bot Engine Status */}
          <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3.5 sm:p-5 hover:border-gray-700 transition-all shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span className="truncate pr-1">Engine State</span>
                <div className="p-1.5 sm:p-2 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
                  <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`inline-block w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full shrink-0 ${
                    botStatus.running ? 'bg-emerald-500 shadow-md shadow-emerald-500/50' : 'bg-slate-500'
                  }`}
                ></span>
                <span className="text-sm sm:text-lg font-bold text-white uppercase tracking-tight truncate">
                  {botStatus.running ? 'SNIPER ACTIVE' : 'IDLE / STOPPED'}
                </span>
              </div>
            </div>
            <div className="mt-2.5 sm:mt-3 text-[11px] sm:text-xs text-slate-400 border-t border-gray-800/80 pt-2 flex flex-wrap items-center justify-between gap-1">
              <span>Target: 97-99¢</span>
              <span className="text-emerald-400 font-medium">Auto-scan</span>
            </div>
          </div>
        </div>

        {/* Charts Section (TradingView Lightweight Charts) */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-3.5 sm:p-5 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Performance & Price Analytics
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Interactive TradingView charts powered by SQLite historical data
              </p>
            </div>

            {/* Chart Tab Switcher */}
            <div className="flex p-1 rounded-xl bg-gray-950 border border-gray-800 text-xs w-full sm:w-auto">
              <button
                onClick={() => setActiveChartTab('pnl')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold transition-all text-center ${
                  activeChartTab === 'pnl'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Cumulative PnL
              </button>
              <button
                onClick={() => setActiveChartTab('ticks')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg font-semibold transition-all text-center ${
                  activeChartTab === 'ticks'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Spot vs Strike Stream
              </button>
            </div>
          </div>

          {/* Render Active Chart */}
          {activeChartTab === 'pnl' ? (
            <PnLChart data={pnlHistory} />
          ) : (
            <PriceTicksChart ticks={ticks} />
          )}
        </div>

        {/* Trades Table Section */}
        <div className="bg-gray-900/80 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Table Toolbar */}
          <div className="p-3.5 sm:p-4 lg:p-5 border-b border-gray-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                  <Layers className="w-4 h-4 text-blue-400" /> Position History & Analytics
                  {dateSummary && (
                    <span className="ml-1 px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
                      <Calendar className="w-3.5 h-3.5" /> {dateSummary}
                      <button
                        onClick={() => {
                          setDatePreset('ALL');
                          setStartDate('');
                          setEndDate('');
                          setPage(1);
                        }}
                        className="hover:text-white transition-colors"
                        title="Clear date filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Showing {filteredPositions.length} recorded positions
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowResetDbModal(true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 hover:text-rose-200 transition-all font-medium shadow-sm"
                  title="Purge and reset SQLite database records"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" /> Reset DB
                </button>
                <button
                  onClick={exportCsv}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs text-slate-200 transition-all font-medium"
                  title="Export filtered trades to CSV"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
            </div>

            {/* Filter controls row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2.5 border-t border-gray-800/60">
              {/* Date Filter Presets */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-gray-950 border border-gray-800 text-xs w-full sm:w-auto">
                  <span className="px-2 text-slate-500 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" /> Date:
                  </span>
                  {(
                    [
                      { id: 'ALL', label: 'All' },
                      { id: 'TODAY', label: 'Today' },
                      { id: 'YESTERDAY', label: 'Yesterday' },
                      { id: '7D', label: '7D' },
                      { id: '30D', label: '30D' },
                      { id: 'CUSTOM', label: 'Custom' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setDatePreset(item.id);
                        setPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                        datePreset === item.id
                          ? 'bg-blue-600 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Custom Date Pickers when CUSTOM is active */}
                {datePreset === 'CUSTOM' && (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1 text-xs">
                      <span className="text-slate-500 font-medium">From:</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setPage(1);
                        }}
                        className="bg-transparent text-slate-200 focus:outline-none [color-scheme:dark] text-xs w-full"
                      />
                    </div>
                    <div className="flex-1 sm:flex-initial flex items-center gap-1.5 bg-gray-950 border border-gray-800 rounded-xl px-2.5 py-1 text-xs">
                      <span className="text-slate-500 font-medium">To:</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setPage(1);
                        }}
                        className="bg-transparent text-slate-200 focus:outline-none [color-scheme:dark] text-xs w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Status / Outcome / Search Filters */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
                {/* Search input */}
                <div className="relative flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Filter strike, spot..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all w-full sm:w-44"
                  />
                </div>

                {/* Outcome filter */}
                <select
                  value={outcomeFilter}
                  onChange={(e) => {
                    setOutcomeFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">All Outcomes</option>
                  <option value="YES">YES Only</option>
                  <option value="NO">NO Only</option>
                </select>

                {/* Result filter */}
                <select
                  value={resultFilter}
                  onChange={(e) => {
                    setResultFilter(e.target.value as any);
                    setPage(1);
                  }}
                  className="flex-1 sm:flex-initial px-2.5 py-1.5 rounded-lg bg-gray-950 border border-gray-800 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                >
                  <option value="ALL">All Results</option>
                  <option value="WON">Won Only</option>
                  <option value="LOST">Lost Only</option>
                  <option value="OPEN">Open Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0c101c] text-slate-400 uppercase font-semibold border-b border-gray-800 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4 text-amber-400">Remaining At Bet</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4">Bet ($)</th>
                  <th className="py-3 px-4">Price To Beat</th>
                  <th className="py-3 px-4">Entry Spot Price</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4 text-right">Net PnL ($)</th>
                  <th className="py-3 px-4 text-center">Window Scan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 font-mono">
                {paginatedPositions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                      No matching trade records found.
                    </td>
                  </tr>
                ) : (
                  paginatedPositions.map((pos) => {
                    const isWon = pos.resolved && pos.won;
                    const isLost = pos.resolved && !pos.won;
                    const isOpen = !pos.resolved;
                    const remStr =
                      pos.remainingTime ||
                      (pos.secondsRemaining ? `${pos.secondsRemaining}s` : '-');

                    return (
                      <tr key={pos.id} className="hover:bg-gray-800/30 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-sans whitespace-nowrap">
                          {new Date(pos.entryTime).toLocaleTimeString()}
                        </td>

                        {/* Remaining Time Highlight Badge */}
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="w-3 h-3 text-amber-400" />
                            {remStr}
                          </span>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-bold text-[11px] ${
                              pos.outcome === 'YES'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {pos.outcome}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                          ${pos.amountUsdc.toFixed(2)}
                        </td>

                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          ${pos.strikePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3 px-4 text-slate-300 whitespace-nowrap">
                          ${pos.entryBtcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap font-sans">
                          {isOpen && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              OPEN ⏳
                            </span>
                          )}
                          {isWon && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                              WON 🏆
                            </span>
                          )}
                          {isLost && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/20">
                              LOST ❌
                            </span>
                          )}
                        </td>

                        <td
                          className={`py-3 px-4 text-right font-bold whitespace-nowrap ${
                            isOpen
                              ? 'text-slate-500'
                              : isWon
                              ? 'text-emerald-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {isOpen
                            ? '-'
                            : (pos.pnlUsdc! >= 0 ? '+' : '') +
                              '$' +
                              pos.pnlUsdc!.toFixed(2)}
                        </td>

                        {/* Full Price Scan Action - Only on LOST cases */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isLost ? (
                            <button
                              onClick={() => setSelectedPosition(pos)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-sans font-bold transition-all hover:scale-105 shadow-sm shadow-rose-950"
                              title="Inspect full price scan of this lost window"
                            >
                              <Activity className="w-3.5 h-3.5 text-rose-400" />
                              Track Scan
                            </button>
                          ) : (
                            <span className="text-slate-600 text-xs font-mono">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="p-3.5 sm:p-4 border-t border-gray-800 bg-[#0c101c] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex flex-wrap items-center justify-between sm:justify-start w-full sm:w-auto gap-3">
              <span>
                Showing {Math.min((page - 1) * pageSize + 1, filteredPositions.length)} to{' '}
                {Math.min(page * pageSize, filteredPositions.length)} of {filteredPositions.length}{' '}
                positions
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-gray-900 border border-gray-800 text-slate-300 rounded px-2 py-0.5 outline-none focus:border-cyan-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-medium text-slate-200">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:bg-gray-800 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/80 py-4 px-4 sm:px-6 text-center text-xs text-slate-500">
        Polymarket BTC 5M Pure DOM Sniper Dashboard &bull; SQLite Database &bull; TradingView Charts &bull; Tailwind CSS v4
      </footer>

      {/* Full Window Scan Audit Modal */}
      {selectedPosition && (
        <WindowScanModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
        />
      )}

      {/* Reset DB Confirmation Modal */}
      <ResetDbModal
        isOpen={showResetDbModal}
        onClose={() => setShowResetDbModal(false)}
        onResetComplete={() => {
          fetchData();
        }}
        currentMode={mode}
      />

      {/* Stop at Balance Configuration Modal */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0f1422] border border-blue-500/30 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="p-4 sm:p-5 border-b border-gray-800/80 bg-blue-500/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Stop Bet at Balance</h3>
                  <p className="text-[11px] text-slate-400">Automatic safety circuit breaker</p>
                </div>
              </div>
              <button
                onClick={() => setShowBalanceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStopBalance} className="p-5 space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed text-[11px]">
                If your account balance drops to or below this USDC threshold, the bot will automatically halt betting to protect your capital. Set to <strong className="text-white">0</strong> to disable.
              </p>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Stop Balance Limit (USDC)
                </label>
                <div className="flex items-center bg-gray-950 border border-gray-800 focus-within:border-blue-500 rounded-xl px-3 py-2">
                  <span className="text-slate-500 font-mono font-bold mr-1">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={stopBalanceInput}
                    onChange={(e) => setStopBalanceInput(e.target.value)}
                    className="bg-transparent text-white font-mono text-sm w-full focus:outline-none"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800/80">
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-slate-300 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20"
                >
                  Save Limit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
