// فایل کامل: src/app/api/admin/assessments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';

// DELETE: حذف تمام رکوردهای ارزیابی‌ها و پیام‌های چت
export async function DELETE(request: NextRequest) {
    // اینجا هم در یک پروژه واقعی باید احراز هویت ادمین چک شود
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            // به دلیل وجود foreign key، ابتدا باید جداول فرزند را خالی کنیم
            await connection.execute('DELETE FROM chat_messages');
            await connection.execute('DELETE FROM assessments');
            await connection.commit();

            return NextResponse.json({ success: true, message: 'تمام نتایج ارزیابی‌ها با موفقیت پاک شدند.' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting assessments:', error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}