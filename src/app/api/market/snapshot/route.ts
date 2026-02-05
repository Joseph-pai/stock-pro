import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const TTL = 3600; // 1 hour

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = searchParams.get('market') as 'TWSE' | 'TPEX';
        const sector = searchParams.get('sector') || (market === 'TWSE' ? 'ALL' : 'AL');

        const cacheKey = `tsbs:snap:${market}:${sector}`;

        // 1. Try Cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            return NextResponse.json({
                success: true,
                data: parsed,
                count: parsed.length,
                cached: true
            });
        }

        console.log(`[Snapshot API] Cache Miss: Targeting ${market} - SubSector: ${sector}`);

        let data = [];
        if (sector === 'ALL' || sector === 'AL') {
            data = await ExchangeClient.getAllMarketQuotes(market);
        } else {
            data = await ExchangeClient.getQuotesBySector(market, sector);
        }

        // 2. Save to Cache
        await redis.set(cacheKey, JSON.stringify(data), 'EX', TTL);

        return NextResponse.json({
            success: true,
            data,
            count: data.length
        });
    } catch (error: any) {
        console.error('[Snapshot API] Fatal Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
