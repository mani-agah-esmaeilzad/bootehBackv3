// src/app/api/admin/questionnaires/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { z } from 'zod';

// Schema به حالت اولیه بازگشت (بدون category)
const questionnaireSchema = z.object({
    name: z.string().min(3),
    description: z.string().optional().nullable(),
    initial_prompt: z.string().min(20),
    persona_prompt: z.string().min(20),
    analysis_prompt: z.string().min(20),
    has_timer: z.boolean(),
    timer_duration: z.coerce.number().optional().nullable(),
});

// GET function (بدون تغییر)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    // ...
}

// PUT function به حالت اولیه بازگشت
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        
        const decodedToken = authenticateToken(token) as { id: number; role: string; };
        if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });

        const { id } = params;
        const body = await request.json();

        const validationResult = questionnaireSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ success: false, message: "داده‌های ورودی نامعتبر است", errors: validationResult.error.errors }, { status: 400 });
        }
        
        const {
            name, description, initial_prompt, persona_prompt, 
            analysis_prompt, has_timer, timer_duration
        } = validationResult.data;

        connection = await getConnectionWithRetry();
        
        await connection.execute(
            `UPDATE questionnaires SET
                name = ?, description = ?, initial_prompt = ?, persona_prompt = ?, 
                analysis_prompt = ?, has_timer = ?, timer_duration = ?
             WHERE id = ?`,
            [
                name, description, initial_prompt, persona_prompt, 
                analysis_prompt, has_timer, has_timer ? timer_duration : null,
                id
            ]
        );
        
        return NextResponse.json({ success: true, message: "پرسشنامه با موفقیت به‌روزرسانی شد." });

    } catch (error: any) {
        console.error('Update Questionnaire API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
