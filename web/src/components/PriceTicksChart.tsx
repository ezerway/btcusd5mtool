import { useState, useEffect, useRef, useMemo } from 'react';
import {
  createChart,
  ColorType,
  LineSeries,
  BaselineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TrendingUp, TrendingDown, Zap, Activity, Layers, Target } from 'lucide-react';

export interface TickPoint {
  id: number;
  timestamp: number;
  upPrice: number;
  downPrice: number;
  priceToBeat: number;
  currentPrice: number;
  priceDelta: number;
  marketSlug?: string | null;
  secondsRemaining?: number | null;
  remainingTime?: string | null;
}

interface PriceTicksChartProps {
  ticks: TickPoint[];
}

export const PriceTicksChart: React.FC<PriceTicksChartProps> = ({ ticks }) => {
  const [chartMode, setChartMode] = useState<'delta' | 'prices' | 'dual'>('delta');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [hoveredTick, setHoveredTick] = useState<TickPoint | null>(null);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const spotSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const beatSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const deltaSeriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  // Filter and prepare sorted ticks based on scope
  const filteredTicks = useMemo(() => {
    if (!ticks || ticks.length === 0) return [];

    const sorted = [...ticks].sort((a, b) => a.timestamp - b.timestamp);

    if (scope === 'current') {
      const latest = sorted[sorted.length - 1];
      // Match current round by marketSlug if available, or by latest strike price
      return sorted.filter((t) => {
        if (latest.marketSlug && t.marketSlug) {
          return t.marketSlug === latest.marketSlug;
        }
        return Math.abs(t.priceToBeat - latest.priceToBeat) < 0.001;
      });
    }

    return sorted;
  }, [ticks, scope]);

  // Derived current metrics & summary
  const currentMetrics = useMemo(() => {
    if (!filteredTicks || filteredTicks.length === 0) return null;

    const latest = filteredTicks[filteredTicks.length - 1];
    const diffs = filteredTicks.map((t) => t.currentPrice - t.priceToBeat);
    const minDiff = Math.min(...diffs);
    const maxDiff = Math.max(...diffs);
    const currentDiff = +(latest.currentPrice - latest.priceToBeat).toFixed(2);

    return {
      latest,
      currentDiff,
      minDiff: +minDiff.toFixed(2),
      maxDiff: +maxDiff.toFixed(2),
    };
  }, [filteredTicks]);

  // Active display values (hovered or latest)
  const displaySpot = hoveredTick
    ? hoveredTick.currentPrice
    : currentMetrics?.latest.currentPrice ?? 0;
  const displayBeat = hoveredTick
    ? hoveredTick.priceToBeat
    : currentMetrics?.latest.priceToBeat ?? 0;
  const displayDiff = +(displaySpot - displayBeat).toFixed(2);
  const isPositive = displayDiff >= 0;

  // Initialize and recreate chart when chartMode or scope changes
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Reset old chart instance
    if (chartRef.current) {
      const oldChart = chartRef.current;
      chartRef.current = null;
      spotSeriesRef.current = null;
      beatSeriesRef.current = null;
      deltaSeriesRef.current = null;
      try {
        oldChart.remove();
      } catch {}
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0b0f19' },
        textColor: '#94a3b8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.6)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.6)' },
      },
      leftPriceScale: {
        visible: chartMode === 'dual',
        borderColor: '#334155',
        autoScale: true,
      },
      rightPriceScale: {
        visible: true,
        borderColor: '#334155',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        vertLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: '#64748b',
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: window.innerWidth < 640 ? 250 : 330,
    });

    chartRef.current = chart;

    // Build series based on active chartMode
    if (chartMode === 'delta') {
      // High-precision Baseline centered on 0.00
      const deltaSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#10b981',
        topFillColor1: 'rgba(16, 185, 129, 0.40)',
        topFillColor2: 'rgba(16, 185, 129, 0.05)',
        bottomLineColor: '#f43f5e',
        bottomFillColor1: 'rgba(244, 63, 94, 0.05)',
        bottomFillColor2: 'rgba(244, 63, 94, 0.40)',
        lineWidth: 2,
        title: 'Diff (Spot - Strike)',
        priceFormat: {
          type: 'price',
          precision: 2,
          minMove: 0.01,
        },
      });

      // Horizontal dashed zero line
      deltaSeries.createPriceLine({
        price: 0,
        color: '#64748b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Strike (0.00)',
      });

      deltaSeriesRef.current = deltaSeries;
    } else if (chartMode === 'prices') {
      // Spot BTC (Sky blue)
      const spotSeries = chart.addSeries(LineSeries, {
        color: '#38bdf8',
        lineWidth: 2,
        title: 'Current Spot',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      // Price to Beat / Strike (Amber dashed)
      const beatSeries = chart.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: 'Strike Price',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      spotSeriesRef.current = spotSeries;
      beatSeriesRef.current = beatSeries;
    } else if (chartMode === 'dual') {
      // Spot & Beat on Right Scale
      const spotSeries = chart.addSeries(LineSeries, {
        priceScaleId: 'right',
        color: '#38bdf8',
        lineWidth: 2,
        title: 'Spot ($)',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      const beatSeries = chart.addSeries(LineSeries, {
        priceScaleId: 'right',
        color: '#f59e0b',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: 'Strike ($)',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      // Delta on Left Scale with Baseline
      const deltaSeries = chart.addSeries(BaselineSeries, {
        priceScaleId: 'left',
        baseValue: { type: 'price', price: 0 },
        topLineColor: '#10b981',
        topFillColor1: 'rgba(16, 185, 129, 0.30)',
        topFillColor2: 'rgba(16, 185, 129, 0.02)',
        bottomLineColor: '#f43f5e',
        bottomFillColor1: 'rgba(244, 63, 94, 0.02)',
        bottomFillColor2: 'rgba(244, 63, 94, 0.30)',
        lineWidth: 2,
        title: 'Diff ($)',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      });

      deltaSeries.createPriceLine({
        price: 0,
        color: '#64748b',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '0.00',
      });

      spotSeriesRef.current = spotSeries;
      beatSeriesRef.current = beatSeries;
      deltaSeriesRef.current = deltaSeries;
    }

    // Subscribe to crosshair move for interactive hover tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setHoveredTick(null);
        return;
      }
      const sec = typeof param.time === 'number' ? param.time : 0;
      const match = filteredTicks.find((t) => Math.floor(t.timestamp / 1000) === sec);
      if (match) {
        setHoveredTick(match);
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: window.innerWidth < 640 ? 250 : 330,
          });
        } catch {}
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      spotSeriesRef.current = null;
      beatSeriesRef.current = null;
      deltaSeriesRef.current = null;
      if (chartRef.current) {
        const c = chartRef.current;
        chartRef.current = null;
        try {
          c.remove();
        } catch {}
      }
    };
  }, [chartMode]);

  // Feed data into chart whenever filteredTicks changes
  useEffect(() => {
    if (!chartRef.current || !filteredTicks || filteredTicks.length === 0) return;

    // Deduplicate and sort by second timestamp
    const uniqueMap = new Map<number, TickPoint>();
    filteredTicks.forEach((t) => {
      const sec = Math.floor(t.timestamp / 1000);
      uniqueMap.set(sec, t);
    });

    const sortedSecs = Array.from(uniqueMap.keys()).sort((a, b) => a - b);

    try {
      if (deltaSeriesRef.current) {
        const deltaData = sortedSecs.map((sec) => {
          const t = uniqueMap.get(sec)!;
          const diff = +(t.currentPrice - t.priceToBeat).toFixed(2);
          return {
            time: sec as UTCTimestamp,
            value: diff,
          };
        });
        deltaSeriesRef.current.setData(deltaData);
      }

      if (spotSeriesRef.current && beatSeriesRef.current) {
        const spotData = sortedSecs.map((sec) => ({
          time: sec as UTCTimestamp,
          value: uniqueMap.get(sec)!.currentPrice,
        }));
        const beatData = sortedSecs.map((sec) => ({
          time: sec as UTCTimestamp,
          value: uniqueMap.get(sec)!.priceToBeat,
        }));

        spotSeriesRef.current.setData(spotData);
        beatSeriesRef.current.setData(beatData);
      }

      chartRef.current?.timeScale().fitContent();
    } catch {
      // Safely ignore any race condition during chart re-render
    }
  }, [filteredTicks, chartMode]);

  return (
    <div className="w-full space-y-3">
      {/* Top HUD & Control Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 sm:p-3.5 bg-gray-950/70 border border-gray-800/80 rounded-2xl">
        {/* Left: Real-time Live Difference HUD */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-blue-400" />
              {hoveredTick ? 'Hovered:' : 'Live Diff:'}
            </span>

            {/* Prominent Diff Value Badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl font-mono text-xs font-bold transition-all shadow-sm ${
                isPositive
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              }`}
            >
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>
                {isPositive ? '+' : ''}${displayDiff.toFixed(2)}
              </span>
              <span className="text-[10px] font-medium opacity-80 hidden sm:inline">
                ({isPositive ? 'Spot > Strike' : 'Spot < Strike'})
              </span>
            </div>
          </div>

          {/* Readout of Spot and Strike */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs text-slate-300 font-mono">
            <span>
              Spot:{' '}
              <strong className="text-sky-400 font-semibold">
                ${displaySpot.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
            <span className="text-slate-600">|</span>
            <span>
              Strike:{' '}
              <strong className="text-amber-400 font-semibold">
                ${displayBeat.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </span>
            {currentMetrics && (
              <>
                <span className="text-slate-600 hidden md:inline">|</span>
                <span className="text-[11px] text-slate-400 hidden md:inline">
                  Range: [{currentMetrics.minDiff >= 0 ? '+' : ''}${currentMetrics.minDiff} ...{' '}
                  {currentMetrics.maxDiff >= 0 ? '+' : ''}${currentMetrics.maxDiff}]
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: Mode & Scope Selectors */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Scope Filter */}
          <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-gray-900 border border-gray-800 text-xs">
            <button
              onClick={() => setScope('current')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                scope === 'current'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Zoom into current 5M round ticks (magnifies small price diffs)"
            >
              🎯 Current Round
            </button>
            <button
              onClick={() => setScope('all')}
              className={`px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                scope === 'all'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Show all recorded ticks across rounds"
            >
              All Ticks ({ticks.length})
            </button>
          </div>

          {/* Chart View Mode Switcher */}
          <div className="flex items-center p-0.5 sm:p-1 rounded-xl bg-gray-900 border border-gray-800 text-xs">
            <button
              onClick={() => setChartMode('delta')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                chartMode === 'delta'
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Magnified spread around $0 baseline - optimal for small price differences"
            >
              <Zap className="w-3 h-3" /> Diff Spread
            </button>
            <button
              onClick={() => setChartMode('prices')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                chartMode === 'prices'
                  ? 'bg-sky-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Absolute Spot & Strike price lines"
            >
              <Activity className="w-3 h-3" /> Spot vs Strike
            </button>
            <button
              onClick={() => setChartMode('dual')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg font-medium transition-all text-xs ${
                chartMode === 'dual'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Both absolute prices (right) and diff spread (left)"
            >
              <Layers className="w-3 h-3" /> Dual
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full relative">
        <div
          ref={chartContainerRef}
          className="w-full rounded-2xl overflow-hidden border border-gray-800 bg-[#0b0f19] shadow-inner"
        />

        {/* Legend overlay under chart */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5 bg-gray-950/60 border-t border-gray-800/80 rounded-b-2xl text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            {chartMode !== 'prices' && (
              <>
                <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  Spot &gt; Strike (Above)
                </span>
                <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                  Spot &lt; Strike (Below)
                </span>
              </>
            )}
            {chartMode !== 'delta' && (
              <>
                <span className="flex items-center gap-1.5 text-sky-400 font-medium">
                  <span className="w-3 h-0.5 bg-sky-400 inline-block"></span> Current Spot BTC
                </span>
                <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                  <span className="w-3 h-0.5 bg-amber-400 inline-block border-dashed"></span> Strike Price To Beat
                </span>
              </>
            )}
          </div>

          <div className="text-slate-500 italic text-[10px]">
            Hover over chart points to inspect exact micro-spread deltas
          </div>
        </div>
      </div>
    </div>
  );
};
