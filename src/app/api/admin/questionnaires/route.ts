// src/app/api/admin/questionnaires/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { z } from 'zod';

const questionnaireSchema = z.object({
  name: z.string().min(3, "نام پرسشنامه حداقل باید ۳ کاراکتر باشد"),
  description: z.string().optional().nullable(),
  initial_prompt: z.string().min(20, "پرامپت اولیه باید حداقل ۲۰ کاراکتر باشد"),
  persona_prompt: z.string().min(20, "پرامپت شخصیت اصلی باید حداقل ۲۰ کاراکتر باشد"),
  analysis_prompt: z.string().min(20, "پرامپت تحلیل نهایی باید حداقل ۲۰ کاراکتر باشد"),
  has_timer: z.boolean().default(false),
  timer_duration: z.coerce.number().optional().nullable(),
  secondary_persona_name: z.string().optional().nullable(),
  secondary_persona_prompt: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        authenticateToken(token);

        connection = await getConnectionWithRetry();
        const [rows] = await connection.execute('SELECT id, name FROM questionnaires');
        return NextResponse.json({ success: true, data: rows });
    } catch (error: any) {
        console.error("Get Questionnaires Error:", error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}

export async function POST(request: NextRequest) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        const decodedToken = authenticateToken(token) as { role: string; };
        if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });

        const body = await request.json();
        const validationResult = questionnaireSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ success: false, message: "داده‌های ورودی نامعتبر است", errors: validationResult.error.errors }, { status: 400 });
        }
        const {
            name, description, initial_prompt, persona_prompt, 
            analysis_prompt, has_timer, timer_duration,
            secondary_persona_name, secondary_persona_prompt
        } = validationResult.data;

        connection = await getConnectionWithRetry();
        
        const [result] = await connection.execute(
            `INSERT INTO questionnaires (name, description, initial_prompt, persona_prompt, analysis_prompt, has_timer, timer_duration, secondary_persona_name, secondary_persona_prompt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, description, initial_prompt, persona_prompt, 
                analysis_prompt, has_timer, 
                has_timer ? timer_duration : null,
                secondary_persona_name, secondary_persona_prompt
            ]
        );
        
        return NextResponse.json({ success: true, data: { id: (result as any).insertId } }, { status: 201 });
    } catch (error: any) {
        console.error('Create Questionnaire API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
