import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const market = searchParams.get('market') || 'ALL';

        console.log(`[API] Fetching market snapshot for: ${market}`);

        const snapshot = await ExchangeClient.getAllMarketQuotes(market);

        return NextResponse.json({
            success: true,
            data: snapshot,
            count: snapshot.length
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
