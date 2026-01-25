/**
 * Price Chart Component
 * 
 * Interactive price chart using lightweight-charts library
 * with timeframe toggles (1H, 1D, 1W, 1M, YTD, ALL)
 */

import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, LineStyle, ColorType, AreaSeries } from 'lightweight-charts';
import { tokenService, PricePoint } from '../services/token-service';

interface PriceChartProps {
  code: string;
  issuer: string;
  currentPrice?: number;
  priceChange?: number;
}

type Timeframe = '1H' | '1D' | '1W' | '1M' | 'YTD' | 'ALL';

export function PriceChart({ code, issuer, currentPrice, priceChange }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [isLoading, setIsLoading] = useState(true);
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [hoveredTime, setHoveredTime] = useState<string | null>(null);

  const timeframes: Timeframe[] = ['1H', '1D', '1W', '1M', 'YTD', 'ALL'];

  // Fetch price data
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setIsLoading(true);
      try {
        const data = await tokenService.getPriceHistory(code, issuer, activeTimeframe);
        if (isMounted) {
          setPriceData(data);
        }
      } catch (error) {
        console.error('Failed to fetch price data:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [code, issuer, activeTimeframe]);

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart if not exists
    if (!chartRef.current) {
      chartRef.current = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#666',
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: '#222', style: LineStyle.Dotted },
        },
        width: chartContainerRef.current.clientWidth,
        height: 200,
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: activeTimeframe === '1H' || activeTimeframe === '1D',
          secondsVisible: false,
        },
        crosshair: {
          vertLine: {
            color: '#444',
            width: 1,
            style: LineStyle.Dashed,
            labelVisible: false,
          },
          horzLine: {
            color: '#444',
            width: 1,
            style: LineStyle.Dashed,
            labelVisible: true,
          },
        },
        handleScroll: false,
        handleScale: false,
      });

      // Determine chart color based on price change
      const isPositive = (priceChange ?? 0) >= 0;
      const lineColor = isPositive ? '#10b981' : '#ef4444';
      const topColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      const bottomColor = isPositive ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)';

      seriesRef.current = chartRef.current.addSeries(AreaSeries, {
        lineColor,
        topColor,
        bottomColor,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: lineColor,
        crosshairMarkerBackgroundColor: '#0f0f0f',
      });

      // Subscribe to crosshair move
      chartRef.current.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setHoveredPrice(null);
          setHoveredTime(null);
          return;
        }

        const price = param.seriesData.get(seriesRef.current!) as { value: number } | undefined;
        if (price) {
          setHoveredPrice(price.value);
          const date = new Date((param.time as number) * 1000);
          setHoveredTime(formatTime(date, activeTimeframe));
        }
      });
    }

    // Update series data
    if (seriesRef.current && priceData.length > 0) {
      const chartData = priceData.map((p) => ({
        time: p.time as any,
        value: p.value,
      }));
      seriesRef.current.setData(chartData);
      chartRef.current?.timeScale().fitContent();

      // Update colors based on price change
      const isPositive = (priceChange ?? 0) >= 0;
      const lineColor = isPositive ? '#10b981' : '#ef4444';
      const topColor = isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)';
      const bottomColor = isPositive ? 'rgba(16, 185, 129, 0.0)' : 'rgba(239, 68, 68, 0.0)';

      seriesRef.current.applyOptions({
        lineColor,
        topColor,
        bottomColor,
      });
    }

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [priceData, priceChange, activeTimeframe]);

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, []);

  // Format time based on timeframe
  function formatTime(date: Date, tf: Timeframe): string {
    if (tf === '1H' || tf === '1D') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  const displayPrice = hoveredPrice ?? currentPrice ?? 0;
  const displayTime = hoveredTime ?? 'Current';

  return (
    <div className="price-chart-container">
      {/* Price display */}
      <div className="chart-price-display">
        <span className="chart-price-value">${displayPrice.toFixed(4)}</span>
        <span className="chart-price-time">{displayTime}</span>
      </div>

      {/* Chart */}
      <div className="chart-wrapper">
        {isLoading && (
          <div className="chart-loading">
            <div className="loading-spinner small" />
          </div>
        )}
        <div ref={chartContainerRef} className="chart-canvas" />
      </div>

      {/* Timeframe toggles */}
      <div className="timeframe-toggles">
        {timeframes.map((tf) => (
          <button
            key={tf}
            className={`timeframe-btn ${activeTimeframe === tf ? 'active' : ''}`}
            onClick={() => setActiveTimeframe(tf)}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
