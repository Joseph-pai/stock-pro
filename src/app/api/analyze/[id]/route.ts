import { NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner';

export async function GET(
    request: Request,
    { params }: { params: { id: string } }
) {
    const id = params.id;
    if (!id) {
        return NextResponse.json({ success: false, error: 'Stock ID required' }, { status: 400 });
    }

    try {
        const result = await ScannerService.analyzeStock(id);

        if (!result) {
            return NextResponse.json({
                success: false,
                error: 'Analysis failed or insufficient data'
            }, { status: 404 });
        }

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
