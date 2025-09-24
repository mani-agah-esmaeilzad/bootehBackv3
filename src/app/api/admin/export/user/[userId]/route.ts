// src/app/api/admin/export/user/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';
import * as xlsx from 'xlsx';

interface Params {
    params: { userId: string };
}

export async function GET(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const userId = parseInt(params.userId, 10);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
        }

        // 1. دریافت اطلاعات کاربر و تمام ارزیابی‌های او
        const [results] = await pool.query<RowDataPacket[]>(`
            SELECT 
                u.username, u.first_name, u.last_name,
                q.name as questionnaire_name,
                a.score, a.max_score, a.description,
                a.completed_at
            FROM assessments a
            JOIN users u ON a.user_id = u.id
            JOIN questionnaires q ON a.questionnaire_id = q.id
            WHERE a.user_id = ? AND a.completed_at IS NOT NULL
            ORDER BY a.completed_at DESC
        `, [userId]);

        if (results.length === 0) {
            return NextResponse.json({ success: false, message: 'هیچ نتیجه تکمیل شده‌ای برای این کاربر یافت نشد' }, { status: 404 });
        }

        const userInfo = {
            username: results[0].username,
            fullName: `${results[0].first_name} ${results[0].last_name}`
        };

        // 2. آماده‌سازی داده‌ها برای اکسل
        const dataForSheet = results.map(row => ({
            "نام پرسشنامه": row.questionnaire_name,
            "نمره": row.score,
            "حداکثر نمره": row.max_score,
            "تاریخ تکمیل": new Date(row.completed_at).toLocaleDateString('fa-IR'),
            "تحلیل نهایی": row.description
        }));

        // 3. ساخت فایل اکسل در حافظه
        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.json_to_sheet(dataForSheet);
        
        // تنظیم عرض ستون‌ها برای خوانایی بهتر
        worksheet['!cols'] = [
            { wch: 30 }, // نام پرسشنامه
            { wch: 10 }, // نمره
            { wch: 15 }, // حداکثر نمره
            { wch: 20 }, // تاریخ تکمیل
            { wch: 100 } // تحلیل نهایی
        ];
        
        xlsx.utils.book_append_sheet(workbook, worksheet, "نتایج ارزیابی");

        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        // 4. ارسال فایل برای دانلود
        const headers = new Headers();
        headers.append('Content-Disposition', `attachment; filename="results-${userInfo.username}.xlsx"`);
        headers.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        return new Response(buffer, {
            status: 200,
            headers: headers
        });

    } catch (err: any) {
        console.error('Export User Error:', err);
        return NextResponse.json({ success: false, message: err.message || 'خطای داخلی سرور' }, { status: 500 });
    }
}
