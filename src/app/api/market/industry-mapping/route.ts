import { NextResponse } from 'next/server';
import { ExchangeClient } from '@/lib/exchange';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'tsbs:map:industry';
const TTL = 60 * 60 * 24 * 7; // 7 days

export async function GET() {
    try {
        // 1. Try Cache
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
            return NextResponse.json({
                success: true,
                data: JSON.parse(cached)
            });
        }

        // 2. Fetch Fresh
        const mapping = await ExchangeClient.getIndustryMapping();

        // 3. Save to Cache
        await redis.set(CACHE_KEY, JSON.stringify(mapping), 'EX', TTL);

        return NextResponse.json({
            success: true,
            data: mapping
        });
    } catch (error: any) {
        console.error('[Industry Mapping API] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
