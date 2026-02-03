import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = searchParams.get('market') as 'TWSE' | 'TPEX';
        const sector = searchParams.get('sector') || (market === 'TWSE' ? 'ALL' : 'AL');

        console.log(`[Snapshot API] Targeting ${market} - SubSector: ${sector}`);

        let data = [];
        if (sector === 'ALL' || sector === 'AL') {
            data = await ExchangeClient.getAllMarketQuotes(market);
        } else {
            data = await ExchangeClient.getQuotesBySector(market, sector);
        }

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
