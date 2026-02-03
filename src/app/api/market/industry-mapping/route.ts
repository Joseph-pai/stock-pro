import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const mapping = await ExchangeClient.getIndustryMapping();
        return NextResponse.json({
            success: true,
            data: mapping
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
