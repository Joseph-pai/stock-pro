import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { AnalysisResult } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    try {
        const { stocks, settings } = await req.json(); // stocks: { id, name }[]

        if (!Array.isArray(stocks) || stocks.length === 0) {
            return NextResponse.json({ success: false, error: 'Empty stock list' }, { status: 400 });
        }

        console.log(`[Deep Analysis] Processing batch of ${stocks.length} stocks...`);

        // Pre-fetch industry mapping once for the entire batch to avoid redundant heavy API calls
        const { ExchangeClient } = await import('@/lib/exchange');
        const mapping = await ExchangeClient.getIndustryMapping();

        // Use the optimized ScannerService which handles Redis caching internally
        const results: AnalysisResult[] = [];

        // 併發控制：調整為 15 支一組，配合預取 mapping 顯著提升速度，避開 504/502
        const batchSize = 15;
        for (let i = 0; i < stocks.length; i += batchSize) {
            const batch = stocks.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(
                batch.map(async (stock: { id: string, name: string }) => {
                    return await ScannerService.analyzeStock(stock.id, settings, stock.name, mapping);
                })
            );

            batchResults.forEach((r, idx) => {
                if (r.status === 'fulfilled' && r.value) {
                    results.push(r.value);
                } else if (r.status === 'rejected') {
                    console.warn(`[Analyze API] Failed to analyze ${batch[idx]?.id}:`, r.reason);
                }
            });

            // 如果清單極大，主動在 25 秒左右截斷以保全 API 響應（針對 Vercel 等平台）
            // console.log(`[Analyze API] Processed ${i + batch.length}/${stocks.length}`);
        }

        console.log(`[Analyze API] Batch complete: ${results.length}/${stocks.length} analyzed (Includes cache hits)`);

        return NextResponse.json({
            success: true,
            data: results,
            count: results.length
        });

    } catch (error: any) {
        console.error('[Analyze API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
