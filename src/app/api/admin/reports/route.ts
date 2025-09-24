// src/app/api/admin/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';

export async function GET(req: NextRequest) {
    let connection;
    try {
        const token = extractTokenFromHeader(req.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        const decodedToken = authenticateToken(token) as { id: number; role: string; };
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        // ✅ کوئری اصلاح شد تا لیستی از ارزیابی‌های فردی را برگرداند
        const [reports] = await connection.execute(`
            SELECT
                a.id AS assessment_id,
                a.completed_at,
                u.id AS user_id,
                u.username,
                u.first_name,
                u.last_name,
                q.name as questionnaire_title
            FROM assessments a
            JOIN users u ON a.user_id = u.id
            JOIN questionnaires q ON a.questionnaire_id = q.id
            WHERE a.completed_at IS NOT NULL
            ORDER BY a.completed_at DESC
        `);

        return NextResponse.json({ success: true, data: reports });

    } catch (err: any) {
        console.error('Error fetching reports:', err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور', details: err.message }, { status: 500 });
    } finally {
        if(connection) connection.release();
    }
}
