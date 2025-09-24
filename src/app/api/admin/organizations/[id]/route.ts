// src/app/api/admin/organizations/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

interface Params {
    params: { id: string };
}

// تابع GET: برای دریافت جزئیات یک سازمان خاص
export async function GET(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const { id } = params;
        
        const [orgs] = await pool.query<RowDataPacket[]>('SELECT * FROM organizations WHERE id = ?', [id]);
        if (orgs.length === 0) {
            return NextResponse.json({ success: false, message: 'سازمان یافت نشد' }, { status: 404 });
        }
        const organization = orgs[0];

        const [questionnaires] = await pool.query<RowDataPacket[]>('SELECT questionnaire_id FROM organization_questionnaires WHERE organization_id = ?', [id]);
        organization.questionnaireIds = questionnaires.map(q => q.questionnaire_id);

        const [users] = await pool.query<RowDataPacket[]>('SELECT user_id FROM organization_users WHERE organization_id = ?', [id]);
        organization.userIds = users.map(u => u.user_id);

        // پاسخ در فرمت صحیح ارسال می‌شود
        return NextResponse.json({ success: true, data: organization });
    } catch (err) {
        console.error(`Error fetching organization ${params.id}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}

// تابع PUT: برای ویرایش یک سازمان
export async function PUT(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const { id } = params;
        const { name, questionnaireIds, userIds } = await req.json();

        if (!name || !questionnaireIds || !userIds) {
            return NextResponse.json({ success: false, message: 'نام سازمان، لیست ارزیابی‌ها و لیست کاربران الزامی است' }, { status: 400 });
        }
        
        const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            await connection.query('UPDATE organizations SET name = ?, slug = ? WHERE id = ?', [name, slug, id]);
            await connection.query('DELETE FROM organization_questionnaires WHERE organization_id = ?', [id]);
            await connection.query('DELETE FROM organization_users WHERE organization_id = ?', [id]);

            if (questionnaireIds.length > 0) {
                const qValues = questionnaireIds.map((qId: number) => [id, qId]);
                await connection.query('INSERT INTO organization_questionnaires (organization_id, questionnaire_id) VALUES ?', [qValues]);
            }
            if (userIds.length > 0) {
                const uValues = userIds.map((uId: number) => [id, uId]);
                await connection.query('INSERT INTO organization_users (organization_id, user_id) VALUES ?', [uValues]);
            }

            await connection.commit();
            connection.release();
            return NextResponse.json({ success: true, message: 'سازمان با موفقیت به‌روزرسانی شد' });

        } catch (err: any) {
            await connection.rollback();
            connection.release();
            if (err.code === 'ER_DUP_ENTRY') {
                return NextResponse.json({ success: false, message: 'سازمانی با این نام از قبل وجود دارد' }, { status: 409 });
            }
            throw err;
        }

    } catch (err) {
        console.error(`Error updating organization ${params.id}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}

// تابع DELETE: برای حذف یک سازمان
export async function DELETE(req: NextRequest, { params }: Params) {
    const { admin, error } = await verifyAdmin(req);
    if (error) {
        return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    try {
        const { id } = params;
        await pool.query('DELETE FROM organizations WHERE id = ?', [id]);
        return NextResponse.json({ success: true, message: 'سازمان با موفقیت حذف شد' });
    } catch (err) {
        console.error(`Error deleting organization ${params.id}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
