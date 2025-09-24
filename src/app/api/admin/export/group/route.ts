// src/app/api/admin/export/group/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';
import * as xlsx from 'xlsx';

export async function POST(req: NextRequest) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const { userIds } = await req.json();

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return NextResponse.json({ success: false, message: 'لیست شناسه‌های کاربران نامعتبر است' }, { status: 400 });
        }

        // 1. دریافت نتایج تمام کاربران انتخاب شده در یک کوئری
        const [results] = await pool.query<RowDataPacket[]>(`
            SELECT 
                u.id as user_id, u.username, u.first_name, u.last_name,
                q.name as questionnaire_name,
                a.score, a.max_score, a.description,
                a.completed_at
            FROM assessments a
            JOIN users u ON a.user_id = u.id
            JOIN questionnaires q ON a.questionnaire_id = q.id
            WHERE a.user_id IN (?) AND a.completed_at IS NOT NULL
            ORDER BY u.id, a.completed_at DESC
        `, [userIds]);

        if (results.length === 0) {
            return NextResponse.json({ success: false, message: 'هیچ نتیجه تکمیل شده‌ای برای کاربران انتخاب شده یافت نشد' }, { status: 404 });
        }

        // 2. ساخت فایل اکسل با یک شیت برای هر کاربر
        const workbook = xlsx.utils.book_new();

        // گروه‌بندی نتایج بر اساس شناسه کاربر
        const resultsByUser = results.reduce((acc, row) => {
            if (!acc[row.user_id]) {
                acc[row.user_id] = [];
            }
            acc[row.user_id].push(row);
            return acc;
        }, {} as Record<number, RowDataPacket[]>);


        for (const userId in resultsByUser) {
            const userResults = resultsByUser[userId];
            const userInfo = userResults[0];
            const sheetName = `${userInfo.first_name} ${userInfo.last_name}`.slice(0, 31); // نام شیت اکسل محدودیت کاراکتر دارد

            const dataForSheet = userResults.map(row => ({
                "نام پرسشنامه": row.questionnaire_name,
                "نمره": row.score,
                "حداکثر نمره": row.max_score,
                "تاریخ تکمیل": new Date(row.completed_at).toLocaleDateString('fa-IR'),
                "تحلیل نهایی": row.description
            }));
            
            const worksheet = xlsx.utils.json_to_sheet(dataForSheet);
            worksheet['!cols'] = [ { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 100 } ];
            xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        // 3. ارسال فایل برای دانلود
        const headers = new Headers();
        headers.append('Content-Disposition', `attachment; filename="group-results.xlsx"`);
        headers.append('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        return new Response(buffer, {
            status: 200,
            headers: headers
        });

    } catch (err: any) {
        console.error('Export Group Error:', err);
        return NextResponse.json({ success: false, message: err.message || 'خطای داخلی سرور' }, { status: 500 });
    }
}
