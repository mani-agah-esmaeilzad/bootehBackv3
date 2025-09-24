// src/app/api/org/[slug]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

interface Params {
    params: { slug: string };
}

// این یک API عمومی است و نیازی به احراز هویت ندارد
export async function GET(req: NextRequest, { params }: Params) {
    try {
        const { slug } = params;

        // 1. پیدا کردن سازمان بر اساس slug
        const [orgs] = await pool.query<RowDataPacket[]>('SELECT id, name FROM organizations WHERE slug = ?', [slug]);

        if (orgs.length === 0) {
            return NextResponse.json({ success: false, message: 'پنل سازمانی یافت نشد' }, { status: 404 });
        }
        const organization = orgs[0];

        // 2. پیدا کردن تمام پرسشنامه‌های متصل به این سازمان
        const [questionnaires] = await pool.query<RowDataPacket[]>(`
            SELECT q.id, q.name, q.description 
            FROM questionnaires q
            JOIN organization_questionnaires oq ON q.id = oq.questionnaire_id
            WHERE oq.organization_id = ?
        `, [organization.id]);

        return NextResponse.json({
            success: true,
            data: {
                organizationName: organization.name,
                questionnaires: questionnaires
            }
        });

    } catch (err) {
        console.error(`Error fetching org panel for slug ${params.slug}:`, err);
        return NextResponse.json({ success: false, message: 'خطای داخلی سرور' }, { status: 500 });
    }
}
