import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
    try {
        const { stage, stockIds, stockId } = await req.json();

        // Stage 1: Fast Discovery (50 stocks)
        if (stage === 'discovery') {
            const results = await ScannerService.scanDiscovery();
            return NextResponse.json({ success: true, data: results });
        }

        // Stage 2: Deep Filtering (Narrow to 30)
        if (stage === 'filter' && Array.isArray(stockIds)) {
            const results = await ScannerService.analyzeCandidates(stockIds);
            return NextResponse.json({ success: true, data: results });
        }

        // Stage 3: Expert Verdict & Recommended (Single stock or specific list)
        if (stage === 'expert' && stockId) {
            const result = await ScannerService.getExpertAnalysis(stockId);
            return NextResponse.json({ success: true, data: result });
        }

        return NextResponse.json({ success: false, error: 'Invalid stage' }, { status: 400 });

    } catch (error: any) {
        console.error('Scan API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
