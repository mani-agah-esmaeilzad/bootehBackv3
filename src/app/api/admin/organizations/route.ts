// src/app/api/admin/organizations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

// تابع GET: برای دریافت لیست تمام سازمان‌ها
export async function GET(req: NextRequest) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const [organizations] = await pool.query<RowDataPacket[]>(
            `SELECT o.id, o.name, o.slug, o.created_at, 
            (SELECT COUNT(*) FROM organization_users ou WHERE ou.organization_id = o.id) as user_count,
            (SELECT COUNT(*) FROM organization_questionnaires oq WHERE oq.organization_id = o.id) as questionnaire_count
            FROM organizations o ORDER BY o.created_at DESC`
        );
        // پاسخ در فرمت صحیح ارسال می‌شود
        return NextResponse.json({ success: true, data: organizations });
    } catch (err) {
        console.error('Error fetching organizations:', err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}

// تابع POST: برای ایجاد یک سازمان جدید
export async function POST(req: NextRequest) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const { name, questionnaireIds, userIds } = await req.json();

        if (!name || !questionnaireIds || !userIds) {
            return NextResponse.json({ success: false, message: 'نام سازمان، لیست ارزیابی‌ها و لیست کاربران الزامی است' }, { status: 400 });
        }

        const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            const [result]: any = await connection.query(
                'INSERT INTO organizations (name, slug) VALUES (?, ?)',
                [name, slug]
            );
            const organizationId = result.insertId;

            if (questionnaireIds.length > 0) {
                const qValues = questionnaireIds.map((id: number) => [organizationId, id]);
                await connection.query('INSERT INTO organization_questionnaires (organization_id, questionnaire_id) VALUES ?', [qValues]);
            }

            if (userIds.length > 0) {
                const uValues = userIds.map((id: number) => [organizationId, id]);
                await connection.query('INSERT INTO organization_users (organization_id, user_id) VALUES ?', [uValues]);
            }

            await connection.commit();
            connection.release();

            return NextResponse.json({ success: true, message: 'سازمان با موفقیت ایجاد شد', data: { organizationId, slug } }, { status: 201 });

        } catch (err: any) {
            await connection.rollback();
            connection.release();
            if (err.code === 'ER_DUP_ENTRY') {
                return NextResponse.json({ success: false, message: 'سازمانی با این نام از قبل وجود دارد' }, { status: 409 });
            }
            throw err;
        }

    } catch (err) {
        console.error('Error creating organization:', err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
