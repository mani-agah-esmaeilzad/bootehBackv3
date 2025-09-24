// src/app/api/assessment/start/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import pool from '@/lib/database';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';

interface Params {
  params: { id: string };
}

export async function POST(request: NextRequest, { params }: Params) {
  // 1️⃣ اعتبارسنجی توکن
  const token = extractTokenFromHeader(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
  }

  const decodedToken = authenticateToken(token);
  if (!decodedToken || !decodedToken.userId) {
    return NextResponse.json({ success: false, message: 'توکن نامعتبر است' }, { status: 401 });
  }

  try {
    const questionnaireId = parseInt(params.id, 10);
    if (isNaN(questionnaireId)) {
      return NextResponse.json({ success: false, message: 'ID پرسشنامه نامعتبر است' }, { status: 400 });
    }

    const connection = await pool.getConnection();

    try {
      // 2️⃣ ایجاد رکورد جدید در جدول assessments
      const [insertResult]: any = await connection.query(
        'INSERT INTO assessments (user_id, questionnaire_id, created_at) VALUES (?, ?, NOW())',
        [decodedToken.userId, questionnaireId]
      );
      const newAssessmentId = insertResult.insertId;

      // 3️⃣ دریافت اطلاعات پرسشنامه
      const [questionnaires] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM questionnaires WHERE id = ?',
        [questionnaireId]
      );
      if (questionnaires.length === 0) {
        throw new Error('پرسشنامه یافت نشد');
      }
      const questionnaire = questionnaires[0];

      // 4️⃣ تولید sessionId و پیام اولیه
      const sessionId = uuidv4();
      const initialMessage = (questionnaire.initial_prompt || '')
        .replace(/{user_name}/g, decodedToken.username || "کاربر");

      // 5️⃣ ارسال کامل به فرانت‌اند
      return NextResponse.json({
        success: true,
        data: {
          sessionId,
          initialMessage,
          assessmentId: newAssessmentId,
          settings: {
            has_timer: questionnaire.has_timer || false,
            timer_duration: questionnaire.timer_duration || 15, // پیش‌فرض ۱۵ دقیقه
          },
        },
      });
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Start Assessment Error:', error);
    return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
  }
}
