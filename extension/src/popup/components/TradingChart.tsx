import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  Time,
} from 'lightweight-charts';
import {
  getChartDataService,
  OHLCVData,
  TimeFrame,
  TradingPair,
  POPULAR_PAIRS,
} from '../../modules/charts';

interface TradingChartProps {
  initialPair?: TradingPair;
  onPairChange?: (pair: TradingPair) => void;
  height?: number;
}

const TIMEFRAMES: TimeFrame[] = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'];

// Token icons as inline SVG data
const TOKEN_ICONS: Record<string, { color: string; symbol: string }> = {
  XLM: { color: '#08B5E5', symbol: 'X' },
  SOL: { color: '#9945FF', symbol: 'S' },
  USDC: { color: '#2775CA', symbol: '$' },
  USDT: { color: '#26A17B', symbol: 'T' },
  BONK: { color: '#FF6B00', symbol: 'B' },
  JUP: { color: '#00D18C', symbol: 'J' },
  WIF: { color: '#B8860B', symbol: 'W' },
  SRT: { color: '#00C853', symbol: 'R' },
};

export function TradingChart({ initialPair, onPairChange, height }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [pair, setPair] = useState<TradingPair>(
    initialPair || POPULAR_PAIRS[0]
  );
  const [timeframe, setTimeframe] = useState<TimeFrame>('1h');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPairSelector, setShowPairSelector] = useState(false);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#666',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a1a1a',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.2)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a1a1a',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Add volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height || chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Crosshair move handler for OHLC display
    chart.subscribeCrosshairMove((param) => {
      if (param.time && candlestickSeriesRef.current) {
        const data = param.seriesData.get(candlestickSeriesRef.current) as CandlestickData;
        if (data) {
          setOhlc({
            o: data.open as number,
            h: data.high as number,
            l: data.low as number,
            c: data.close as number,
          });
        }
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Load data when pair or timeframe changes
  const loadData = useCallback(async () => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

    setIsLoading(true);

    try {
      const chartService = getChartDataService();
      const data = await chartService.getOHLCVData(pair, timeframe, 200);

      // Convert to chart format
      const candleData: CandlestickData[] = data.map((d: OHLCVData) => ({
        time: d.time as Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      }));

      const volumeData: HistogramData[] = data.map((d: OHLCVData) => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
      }));

      candlestickSeriesRef.current.setData(candleData);
      volumeSeriesRef.current.setData(volumeData);

      // Set current price from last candle
      if (data.length > 0) {
        const lastCandle = data[data.length - 1];
        setCurrentPrice(lastCandle.close);

        // Calculate 24h change
        const firstCandle = data[0];
        const change = ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100;
        setPriceChange(change);

        setOhlc({
          o: lastCandle.open,
          h: lastCandle.high,
          l: lastCandle.low,
          c: lastCandle.close,
        });
      }

      // Fit content
      chartRef.current?.timeScale().fitContent();
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pair, timeframe]);

  useEffect(() => {
    loadData();

    // Set up polling for real-time updates
    const chartService = getChartDataService();
    const unsubscribe = chartService.subscribeToUpdates(
      pair,
      timeframe,
      (data) => {
        if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;

        const candleData: CandlestickData[] = data.map((d: OHLCVData) => ({
          time: d.time as Time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));

        const volumeData: HistogramData[] = data.map((d: OHLCVData) => ({
          time: d.time as Time,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
        }));

        candlestickSeriesRef.current.setData(candleData);
        volumeSeriesRef.current.setData(volumeData);

        if (data.length > 0) {
          const lastCandle = data[data.length - 1];
          setCurrentPrice(lastCandle.close);
        }
      },
      30000 // Update every 30 seconds
    );

    return () => {
      unsubscribe();
    };
  }, [pair, timeframe, loadData]);

  const handlePairChange = (newPair: TradingPair) => {
    setPair(newPair);
    setShowPairSelector(false);
    onPairChange?.(newPair);
  };

  const formatPrice = (price: number): string => {
    if (price >= 1) {
      return price.toFixed(2);
    } else if (price >= 0.0001) {
      return price.toFixed(6);
    } else {
      return price.toExponential(4);
    }
  };

  return (
    <div className="trading-chart">
      {/* Chart Header */}
      <div className="chart-header">
        <div className="chart-pair-info">
          {/* Pair Selector */}
          <div className="pair-selector-container">
            <button
              className="pair-selector-btn"
              onClick={() => setShowPairSelector(!showPairSelector)}
            >
              <div className="pair-icons">
                <div
                  className="token-icon"
                  style={{ backgroundColor: TOKEN_ICONS[pair.base]?.color || '#666' }}
                >
                  {TOKEN_ICONS[pair.base]?.symbol || pair.base[0]}
                </div>
                <div
                  className="token-icon token-icon-overlap"
                  style={{ backgroundColor: TOKEN_ICONS[pair.quote]?.color || '#666' }}
                >
                  {TOKEN_ICONS[pair.quote]?.symbol || pair.quote[0]}
                </div>
              </div>
              <span className="pair-name">{pair.base} / {pair.quote}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {showPairSelector && (
              <div className="pair-dropdown">
                {POPULAR_PAIRS.map((p) => (
                  <button
                    key={`${p.base}-${p.quote}`}
                    className={`pair-option ${p.base === pair.base && p.quote === pair.quote ? 'active' : ''}`}
                    onClick={() => handlePairChange(p)}
                  >
                    <div className="pair-icons">
                      <div
                        className="token-icon small"
                        style={{ backgroundColor: TOKEN_ICONS[p.base]?.color || '#666' }}
                      >
                        {TOKEN_ICONS[p.base]?.symbol || p.base[0]}
                      </div>
                      <div
                        className="token-icon token-icon-overlap small"
                        style={{ backgroundColor: TOKEN_ICONS[p.quote]?.color || '#666' }}
                      >
                        {TOKEN_ICONS[p.quote]?.symbol || p.quote[0]}
                      </div>
                    </div>
                    <span>{p.base}/{p.quote}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price Display */}
          <div className="price-display">
            <span className={`current-price ${priceChange >= 0 ? 'positive' : 'negative'}`}>
              {formatPrice(currentPrice)}
            </span>
            <span className={`price-change ${priceChange >= 0 ? 'positive' : 'negative'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="timeframe-selector">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              className={`timeframe-btn ${timeframe === tf ? 'active' : ''}`}
              onClick={() => setTimeframe(tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Chart Tools */}
        <div className="chart-tools">
          <button className="chart-tool-btn" title="Indicators">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-3 3" />
            </svg>
            <span>Indicators</span>
          </button>
        </div>
      </div>

      {/* OHLC Display */}
      {ohlc && (
        <div className="ohlc-display">
          <span className="ohlc-label">{pair.base}/{pair.quote} · {pair.base === 'XLM' || pair.quote === 'XLM' ? 'Stellar' : 'Solana'}</span>
          <span className="ohlc-item">
            <span className="ohlc-key">O</span>
            <span className="ohlc-value">{formatPrice(ohlc.o)}</span>
          </span>
          <span className="ohlc-item">
            <span className="ohlc-key">H</span>
            <span className="ohlc-value high">{formatPrice(ohlc.h)}</span>
          </span>
          <span className="ohlc-item">
            <span className="ohlc-key">L</span>
            <span className="ohlc-value low">{formatPrice(ohlc.l)}</span>
          </span>
          <span className="ohlc-item">
            <span className="ohlc-key">C</span>
            <span className={`ohlc-value ${ohlc.c >= ohlc.o ? 'positive' : 'negative'}`}>
              {formatPrice(ohlc.c)}
            </span>
          </span>
        </div>
      )}

      {/* Chart Container */}
      <div className="chart-container-wrapper">
        {isLoading && (
          <div className="chart-loading">
            <div className="chart-spinner" />
          </div>
        )}
        <div ref={chartContainerRef} className="chart-canvas" />
      </div>

      {/* Volume Label */}
      <div className="volume-label">
        <span>Volume</span>
      </div>

      {/* Network Watermark */}
      <div className="chart-watermark">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <span>{pair.base === 'XLM' || pair.quote === 'XLM' ? 'Stellar Network' : 'Solana Mainnet'}</span>
      </div>
    </div>
  );
}
