import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/market/snapshot
 * 返回全市場當日快照數據（輕量級，用於前端初步篩選）
 */
export async function GET() {
    try {
        const t0 = Date.now();

        // 獲取全市場快照
        const snapshot = await ExchangeClient.getAllMarketQuotes();

        const t1 = Date.now();

        if (snapshot.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Market data not available'
            }, { status: 404 });
        }

        console.log(`[Market Snapshot] Fetched ${snapshot.length} stocks in ${t1 - t0}ms`);

        return NextResponse.json({
            success: true,
            data: snapshot,
            count: snapshot.length,
            timing: {
                fetch: t1 - t0,
                total: t1 - t0
            }
        });

    } catch (error: any) {
        console.error('[Market Snapshot] Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
