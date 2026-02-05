import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { redis } from '@/lib/redis';
import { format } from 'date-fns';

const TTL = 43200; // 12 hours

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    if (!id) {
        return NextResponse.json({ success: false, error: 'Stock ID required' }, { status: 400 });
    }

    try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const cacheKey = `tsbs:ai:${id}:${today}`;

        // 1. Try Cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return NextResponse.json({
                success: true,
                data: JSON.parse(cached),
                cached: true
            });
        }

        // 2. Fetch Fresh
        const result = await ScannerService.analyzeStock(id);

        if (!result) {
            return NextResponse.json({
                success: false,
                error: 'Analysis failed or insufficient data'
            }, { status: 404 });
        }

        // 3. Save to Cache
        await redis.set(cacheKey, JSON.stringify(result), 'EX', TTL);

        return NextResponse.json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error(`Analysis Error [${id}]:`, error);
        return NextResponse.json({
            success: false,
            error: error.message,
            details: error.toString()
        }, { status: 500 });
    }
}
