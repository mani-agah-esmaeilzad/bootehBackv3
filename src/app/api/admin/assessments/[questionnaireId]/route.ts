// فایل کامل: src/app/api/admin/assessments/[questionnaireId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid'; // <--- وارد کردن کتابخانه uuid

export async function POST(
  request: NextRequest,
  { params }: { params: { questionnaireId: string } }
) {
  try {
    // Authentication
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader || undefined);
    if (!token) {
      return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
    }

    const decodedToken = authenticateToken(token);
    if (!decodedToken) {
      return NextResponse.json({ success: false, message: 'توکن نامعتبر یا منقضی شده است' }, { status: 401 });
    }

    const userId = decodedToken.userId;
    const questionnaireId = parseInt(params.questionnaireId, 10);

    if (isNaN(questionnaireId)) {
      return NextResponse.json({ success: false, message: 'شناسه پرسشنامه نامعتبر است' }, { status: 400 });
    }

    const connection = await getConnectionWithRetry();
    if (!connection) {
      throw new Error('Failed to get database connection');
    }

    try {
      // دریافت اطلاعات کاربر و پرسشنامه از دیتابیس
      const [users] = await connection.execute('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
      const [questionnaires] = await connection.execute('SELECT initial_prompt FROM questionnaires WHERE id = ?', [questionnaireId]);

      const userData = Array.isArray(users) && users.length > 0 ? users[0] as any : null;
      const questionnaireData = Array.isArray(questionnaires) && questionnaires.length > 0 ? questionnaires[0] as any : null;

      if (!userData) {
        return NextResponse.json({ success: false, message: 'کاربر یافت نشد' }, { status: 404 });
      }

      if (!questionnaireData) {
        return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
      }

      const userName = `${userData.first_name} ${userData.last_name}`.trim();

      // 1. ایجاد شناسه جلسه جدید با uuid
      const sessionId = uuidv4();

      // 2. جایگزین کردن نام کاربر در پرامپت اولیه
      const finalOpening = questionnaireData.initial_prompt.replace('{user_name}', userName);

      // 3. ایجاد رکورد ارزیابی جدید
      const [result] = await connection.execute(
        'INSERT INTO assessments (user_id, questionnaire_id, score, max_score, created_at) VALUES (?, ?, ?, ?, NOW())',
        [userId, questionnaireId, 0, 100] // max_score را می‌توانید در آینده داینامیک کنید
      );

      const assessmentId = (result as any).insertId;

      // 4. ذخیره وضعیت اولیه در assessment_states
      await connection.execute(
        'INSERT INTO assessment_states (session_id, state_data, created_at) VALUES (?, ?, NOW())',
        [sessionId, JSON.stringify({ assessmentId, userId, questionnaireId })]
      );

      // 5. ذخیره اولین پیام (پیام خوش‌آمدگویی هوش مصنوعی)
      await connection.execute(
        'INSERT INTO chat_messages (assessment_id, user_id, message_type, content, character_name, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [assessmentId, userId, 'model', finalOpening, 'آقای احمدی'] // message_type از 'ai' به 'model' تغییر کرد تا با استاندارد Gemini هماهنگ باشد
      );

      return NextResponse.json({
        success: true,
        message: 'گفتگوی ارزیابی شروع شد',
        data: {
          sessionId: sessionId,
          message: finalOpening,
          assessmentId: assessmentId,
          timestamp: new Date().toISOString()
        }
      });

    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('خطا در شروع ارزیابی:', error);

    // بررسی خطاهای مربوط به توکن
    if (error.name === 'JsonWebTokenError') {
      return NextResponse.json({ success: false, message: 'توکن نامعتبر است' }, { status: 401 });
    }
    if (error.name === 'TokenExpiredError') {
      return NextResponse.json({ success: false, message: 'توکن منقضی شده است' }, { status: 401 });
    }

    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}