import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/database';
import { generateSupplementaryQuestions } from '@/lib/ai-gemini';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) return NextResponse.json({ success: false, message: 'ID نامعتبر' }, { status: 400 });

        const connection = await pool.getConnection();
        try {
            // دریافت تاریخچه چت و پرامپت شخصیت برای ارسال به هوش مصنوعی
            const [assessments] = await connection.execute('SELECT questionnaire_id FROM assessments WHERE id = ?', [assessmentId]);
            if (!Array.isArray(assessments) || assessments.length === 0) throw new Error('ارزیابی یافت نشد');
            const questionnaireId = (assessments[0] as any).questionnaire_id;

            const [questionnaires] = await connection.execute('SELECT persona_prompt FROM questionnaires WHERE id = ?', [questionnaireId]);
            if (!Array.isArray(questionnaires) || questionnaires.length === 0) throw new Error('پرسشنامه یافت نشد');
            const personaPrompt = (questionnaires[0] as any).persona_prompt;

            const [dbHistory] = await connection.execute(
                'SELECT * FROM chat_messages WHERE assessment_id = ? ORDER BY created_at ASC',
                [assessmentId]
            );
            const historyJson = JSON.stringify(dbHistory, null, 2);

            // تولید هوشمند سوالات
            const questions = await generateSupplementaryQuestions(historyJson, personaPrompt);

            const responseData = {
                supplementary_question_1: questions.q1,
                supplementary_question_2: questions.q2
            };

            return NextResponse.json({ success: true, data: responseData });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error fetching supplementary questions:', error);
        return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
    }
}