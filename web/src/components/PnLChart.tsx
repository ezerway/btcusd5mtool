import { useEffect, useRef } from 'react';
import { createChart, ColorType, AreaSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts';

interface PnLPoint {
  time: number;
  pnl: number;
  tradeNumber: number;
  won: boolean;
  outcome: string;
}

interface PnLChartProps {
  data: PnLPoint[];
}

export const PnLChart: React.FC<PnLChartProps> = ({ data }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

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
      crosshair: {
        vertLine: { color: '#4b5563', width: 1, style: 2 },
        horzLine: { color: '#4b5563', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: window.innerWidth < 640 ? 240 : 320,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.4)',
      bottomColor: 'rgba(16, 185, 129, 0.02)',
      lineWidth: 2,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        try {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: window.innerWidth < 640 ? 240 : 320,
          });
        } catch {}
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      seriesRef.current = null;
      if (chartRef.current) {
        const c = chartRef.current;
        chartRef.current = null;
        try {
          c.remove();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !data || data.length === 0) return;

    // Filter out duplicate or out-of-order timestamps
    const sorted = [...data].sort((a, b) => a.time - b.time);
    const uniqueMap = new Map<number, number>();
    sorted.forEach((item) => {
      uniqueMap.set(item.time, item.pnl);
    });

    const chartData = Array.from(uniqueMap.entries()).map(([time, value]) => ({
      time: time as any,
      value,
    }));

    if (chartData.length > 0) {
      try {
        seriesRef.current.setData(chartData);
        chartRef.current?.timeScale().fitContent();
      } catch {}
    }
  }, [data]);

  return (
    <div className="w-full relative">
      <div ref={chartContainerRef} className="w-full rounded-xl overflow-hidden border border-gray-800" />
    </div>
  );
};
