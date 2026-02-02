import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';
import { format, subDays } from 'date-fns';

export async function GET() {
    try {
        // We need about 30 days to ensure we have enough for MA20 even with weekends/holidays
        const dates: string[] = [];
        for (let i = 35; i >= 0; i--) {
            const d = subDays(new Date(), i);
            // Skip weekends if we want to be precise, but FinMind handles dates fine.
            // We'll just provide a range and the scanner fetches what exists.
            dates.push(format(d, 'yyyy-MM-dd'));
        }

        const results = await ScannerService.scanMarket(dates);

        return NextResponse.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error: any) {
        console.error('Scan Error:', error);
        return NextResponse.json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            details: error.toString()
        }, { status: 500 });
    }
}
