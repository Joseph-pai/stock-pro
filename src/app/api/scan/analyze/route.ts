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

        // Use the optimized ScannerService which handles Redis caching internally
        const results: AnalysisResult[] = [];
        const batchResults = await Promise.allSettled(
            stocks.map(async (stock: { id: string, name: string }) => {
                return await ScannerService.analyzeStock(stock.id, settings, stock.name);
            })
        );

        batchResults.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value) {
                results.push(r.value);
            } else if (r.status === 'rejected') {
                console.warn(`[Analyze API] Failed to analyze ${stocks[idx]?.id}:`, r.reason);
            }
        });

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
