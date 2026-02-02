'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, ISeriesApi, CandlestickData, WhitespaceData, Time } from 'lightweight-charts';
import { StockCandle } from '@/types';

interface ChartProps {
    data: StockCandle[];
    ma5?: number[];
    ma10?: number[];
    ma20?: number[];
    poc?: number;
}

export const TradingViewChart: React.FC<ChartProps> = ({ data, ma5, ma10, ma20, poc }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || 400,
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
        });

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#f43f5e', // rose-500 (Red for Taiwan Bull)
            downColor: '#10b981', // emerald-500 (Green for Taiwan Bear)
            borderVisible: false,
            wickUpColor: '#f43f5e',
            wickDownColor: '#10b981',
        });

        candlestickSeries.setData(data as CandlestickData<Time>[]);

        // Render POC Line if available
        if (poc) {
            candlestickSeries.createPriceLine({
                price: poc,
                color: '#facc15', // yellow-400
                lineWidth: 2,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: 'POC',
            });
        }

        // Volume
        const volumeSeries = chart.addHistogramSeries({
            color: '#3b82f6',
            priceFormat: { type: 'volume' },
            priceScaleId: '', // overlay
        });

        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        volumeSeries.setData(data.map(d => ({
            time: d.time,
            value: d.value || 0,
            color: d.close >= d.open ? 'rgba(244, 63, 94, 0.3)' : 'rgba(16, 185, 129, 0.3)',
        })) as any);

        // MAs
        if (ma5) {
            const ma5Series = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, title: 'MA5' });
            ma5Series.setData(data.map((d, i) => ({ time: d.time, value: ma5[i] })) as any);
        }
        if (ma10) {
            const ma10Series = chart.addLineSeries({ color: '#3b82f6', lineWidth: 1, title: 'MA10' });
            ma10Series.setData(data.map((d, i) => ({ time: d.time, value: ma10[i] })) as any);
        }
        if (ma20) {
            const ma20Series = chart.addLineSeries({ color: '#a855f7', lineWidth: 1, title: 'MA20' });
            ma20Series.setData(data.map((d, i) => ({ time: d.time, value: ma20[i] })) as any);
        }

        chart.timeScale().fitContent();

        const handleResize = () => {
            chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data, ma5, ma10, ma20, poc]);

    return <div ref={chartContainerRef} className="w-full h-full" />;
};
