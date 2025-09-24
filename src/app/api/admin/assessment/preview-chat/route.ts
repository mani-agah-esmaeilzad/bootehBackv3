// فایل کامل جدید: src/app/api/admin/assessment/preview-chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import { generateResponse, ChatMessage } from '@/lib/ai';
import pool from '@/lib/database';

export const dynamic = 'force-dynamic';

// Schema برای اعتبارسنجی ورودی
interface PreviewChatRequest {
  message: string;
  history: ChatMessage[];
  questionnaireId: number;
}

export async function POST(request: NextRequest) {
  try {
    const token = extractTokenFromHeader(request.headers.get('authorization'));
    if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });

    const decodedToken = authenticateToken(token);
    if (decodedToken.role !== 'admin') return NextResponse.json({ success: false, message: 'دسترسی غیرمجاز' }, { status: 403 });

    const body: PreviewChatRequest = await request.json();
    const { message, history, questionnaireId } = body;

    if (!message || !history || !questionnaireId) {
        return NextResponse.json({ success: false, message: 'داده‌های ناقص ارسال شده است' }, { status: 400 });
    }

    const connection = await pool.getConnection();
    const [questionnaires]: any[] = await connection.execute('SELECT * FROM questionnaires WHERE id = ?', [questionnaireId]);
    connection.release();

    if (questionnaires.length === 0) {
      return NextResponse.json({ success: false, message: 'پرسشنامه یافت نشد' }, { status: 404 });
    }
    const questionnaire = questionnaires[0];
    
    // شخصی‌سازی پرامپت با اطلاعات ادمین
    const adminName = decodedToken.username || "ادمین";
    const systemInstruction = questionnaire.persona_prompt
      .replace(/{user_name}/g, adminName)
      .replace(/{user_job}/g, "توسعه‌دهنده") // مقدار پیش‌فرض برای تست
      .replace(/{min_questions}/g, questionnaire.min_questions.toString())
      .replace(/{max_questions}/g, questionnaire.max_questions.toString());
      
    const currentHistory: ChatMessage[] = [...history, { role: 'user', content: message }];
      
    let aiResponse = await generateResponse(systemInstruction, currentHistory);
    if (!aiResponse) throw new Error('پاسخ خالی از هوش مصنوعی');

    let isComplete = false;
    if (aiResponse.includes('[END_ASSESSMENT]')) {
      isComplete = true;
      aiResponse = aiResponse.replace('[END_ASSESSMENT]', '').trim();
    }

    return NextResponse.json({
      success: true,
      data: {
        aiResponse: aiResponse,
        isComplete: isComplete
      }
    });

  } catch (error: any) {
    console.error('Preview Chat API Error:', error);
    return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
  }
}
