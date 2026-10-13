import { useEffect, useRef } from 'react';
import { createChart, ColorType, LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';

interface TickPoint {
  id: number;
  timestamp: number;
  upPrice: number;
  downPrice: number;
  priceToBeat: number;
  currentPrice: number;
  priceDelta: number;
}

interface PriceTicksChartProps {
  ticks: TickPoint[];
}

export const PriceTicksChart: React.FC<PriceTicksChartProps> = ({ ticks }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const spotSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const beatSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111827' },
        textColor: '#9ca3af',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 320,
    });

    const spotSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8', // Blue line for live spot
      lineWidth: 2,
      title: 'Current Price',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    const beatSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b', // Amber dashed line for price to beat
      lineWidth: 2,
      lineStyle: 2, // Dashed
      title: 'Price To Beat',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    spotSeriesRef.current = spotSeries;
    beatSeriesRef.current = beatSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!spotSeriesRef.current || !beatSeriesRef.current || !ticks || ticks.length === 0) return;

    const uniqueMap = new Map<number, { spot: number; beat: number }>();
    ticks.forEach((t) => {
      const sec = Math.floor(t.timestamp / 1000);
      uniqueMap.set(sec, { spot: t.currentPrice, beat: t.priceToBeat });
    });

    const sortedSecs = Array.from(uniqueMap.keys()).sort((a, b) => a - b);
    const spotData = sortedSecs.map((sec) => ({
      time: sec as any,
      value: uniqueMap.get(sec)!.spot,
    }));
    const beatData = sortedSecs.map((sec) => ({
      time: sec as any,
      value: uniqueMap.get(sec)!.beat,
    }));

    if (spotData.length > 0) {
      spotSeriesRef.current.setData(spotData);
      beatSeriesRef.current.setData(beatData);
      chartRef.current?.timeScale().fitContent();
    }
  }, [ticks]);

  return (
    <div className="w-full relative">
      <div className="flex items-center gap-4 text-xs font-medium px-3 py-2 bg-gray-900 border-b border-gray-800 rounded-t-xl">
        <span className="flex items-center gap-1.5 text-sky-400">
          <span className="w-3 h-0.5 bg-sky-400 inline-block"></span> Current Spot Price
        </span>
        <span className="flex items-center gap-1.5 text-amber-400">
          <span className="w-3 h-0.5 bg-amber-400 inline-block border-dashed"></span> Price To Beat (Strike)
        </span>
      </div>
      <div ref={chartContainerRef} className="w-full rounded-b-xl overflow-hidden border border-t-0 border-gray-800" />
    </div>
  );
};
