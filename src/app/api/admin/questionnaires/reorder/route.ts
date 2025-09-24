// src/app/api/admin/questionnaires/reorder/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { PoolConnection } from 'mysql2/promise';

export async function PUT(request: NextRequest) {
    let connection: PoolConnection | null = null;

    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }

        const decodedToken = authenticateToken(token) as { id: number; role: string };
        if (decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const { orderedIds } = await request.json();
        if (!Array.isArray(orderedIds)) {
            return NextResponse.json({ success: false, message: 'آرایه ترتیب نامعتبر است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            return NextResponse.json({ success: false, message: 'اتصال به دیتابیس برقرار نشد' }, { status: 500 });
        }

        const promises = orderedIds.map((id, index) =>
            connection!.execute(
                'UPDATE questionnaires SET display_order = ? WHERE id = ?',
                [index, id]
            )
        );

        await Promise.all(promises);

        return NextResponse.json({ success: true, message: 'ترتیب پرسشنامه‌ها با موفقیت ذخیره شد.' });

    } catch (error: any) {
        console.error('Reorder Questionnaires API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) {
            try {
                connection.release();
            } catch (releaseError) {
                console.error('Error releasing connection:', releaseError);
            }
        }
    }
}
