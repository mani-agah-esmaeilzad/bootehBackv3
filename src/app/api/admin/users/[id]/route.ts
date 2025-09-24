// src/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

interface Params {
    params: { id: string };
}

// ✅ تابع GET جدید برای دریافت اطلاعات یک کاربر
export async function GET(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const userId = parseInt(params.id, 10);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
        }

        const [users] = await pool.query<RowDataPacket[]>('SELECT id, username, email, first_name, last_name, phone_number, age, education_level, work_experience, is_active, created_at FROM users WHERE id = ?', [userId]);

        if (users.length === 0) {
            return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
        }

        return NextResponse.json({ success: true, data: users[0] });

    } catch (err: any) {
        console.error(`Error fetching user ${params.id}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}


// تابع DELETE برای حذف یک کاربر (بدون تغییر)
export async function DELETE(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const userId = parseInt(params.id, 10);
        if (isNaN(userId)) {
            return NextResponse.json({ success: false, message: 'شناسه کاربر نامعتبر است' }, { status: 400 });
        }

        await pool.query('DELETE FROM users WHERE id = ?', [userId]);

        return NextResponse.json({ success: true, message: 'کاربر با موفقیت حذف شد' });

    } catch (err: any) {
        console.error(`Error deleting user ${params.id}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
