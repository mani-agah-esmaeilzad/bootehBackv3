// فایل کامل: src/app/api/admin/assessment/preview/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import pool from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // احراز هویت ادمین
    const token = extractTokenFromHeader(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
    const decodedToken = authenticateToken(token);
    if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });

    const questionnaireId = parseInt(params.id, 10);
    if (isNaN(questionnaireId)) {
      return NextResponse.json({ success: false, message: 'ID پرسشنامه نامعتبر است' }, { status: 400 });
    }

    const connection = await pool.getConnection();
    const [questionnaires]: any[] = await connection.execute('SELECT * FROM questionnaires WHERE id = ?', [questionnaireId]);
    connection.release();

    if (questionnaires.length === 0) {
      return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
    }
    const questionnaire = questionnaires[0];

    // ساخت یک session موقت برای پیش‌نمایش
    const sessionId = uuidv4();
    
    // شخصی‌سازی پیام اولیه برای ادمین
    const adminName = decodedToken.username || "ادمین";
    const initialMessage = questionnaire.initial_prompt
      .replace(/{user_name}/g, adminName)
      .replace(/{user_job}/g, "توسعه‌دهنده"); // یک مقدار پیش‌فرض برای تست

    return NextResponse.json({
      success: true,
      data: {
        sessionId: sessionId,
        initialMessage: initialMessage,
        // ID پرسشنامه را هم ارسال می‌کنیم تا در صفحه چت از آن استفاده شود
        questionnaireId: questionnaire.id, 
        settings: {
          has_timer: questionnaire.has_timer,
          timer_duration: questionnaire.timer_duration
        }
      }
    });
  } catch (error: any) {
    console.error('Preview Start Error:', error);
    return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
  }
}
