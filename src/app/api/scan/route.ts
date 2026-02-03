import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // No dates needed anymore for the initial scan (uses official daily snapshot)
        const results = await ScannerService.scanMarket();

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
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
