import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { analyzeConversation } from '@/lib/ai-gemini';
import { getConnectionWithRetry } from '@/lib/database';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });

        authenticateToken(token);
        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) return NextResponse.json({ success: false, message: 'ID ارزیابی نامعتبر است' }, { status: 400 });

        const body = await request.json();
        const supplementaryAnswers = body.supplementary_answers;

        connection = await getConnectionWithRetry();
        if (!connection) throw new Error('اتصال به دیتابیس برقرار نشد');

        const [assessments] = await connection.execute('SELECT questionnaire_id FROM assessments WHERE id = ?', [assessmentId]);
        if (!Array.isArray(assessments) || assessments.length === 0) throw new Error('ارزیابی یافت نشد');
        const questionnaireId = (assessments[0] as any).questionnaire_id;

        const [questionnaires] = await connection.execute('SELECT analysis_prompt FROM questionnaires WHERE id = ?', [questionnaireId]);
        if (!Array.isArray(questionnaires) || questionnaires.length === 0) throw new Error('پرسشنامه یافت نشد');
        const analysisPrompt = (questionnaires[0] as any).analysis_prompt;

        const [dbHistory] = await connection.execute(
            'SELECT message_type, content FROM chat_messages WHERE assessment_id = ? ORDER BY created_at ASC',
            [assessmentId]
        );

        let fullHistory = dbHistory as any[];
        if (supplementaryAnswers) {
            if (supplementaryAnswers.q1) fullHistory.push({ message_type: 'user', content: `پاسخ سوال تکمیلی ۱: ${supplementaryAnswers.q1}` });
            if (supplementaryAnswers.q2) fullHistory.push({ message_type: 'user', content: `پاسخ سوال تکمیلی ۲: ${supplementaryAnswers.q2}` });
        }

        const historyJson = JSON.stringify(fullHistory, null, 2);
        const rawAnalysisResult = await analyzeConversation(historyJson, analysisPrompt);
        if (!rawAnalysisResult) throw new Error("تحلیل از هوش مصنوعی دریافت نشد.");

        let score = 0;
        let report = "تحلیل با فرمت نامعتبر دریافت شد.";
        let factorScores: any[] = [];

        try {
            // ✅ استخراج ساختار کامل JSON از پاسخ AI
            const jsonMatch = rawAnalysisResult.match(/\{[\s\S]*\}/);
            if (jsonMatch && jsonMatch[0]) {
                const parsedResult = JSON.parse(jsonMatch[0]);
                score = parsedResult.score || 0;
                report = parsedResult.report || rawAnalysisResult;
                factorScores = parsedResult.factor_scores || [];
            } else {
                report = rawAnalysisResult;
            }
        } catch (e) {
            console.error("Error parsing AI analysis JSON:", e);
            report = rawAnalysisResult;
        }

        // ✅ ذخیره امتیازات فاکتورها به صورت JSON در دیتابیس
        await connection.execute(
            'UPDATE assessments SET score = ?, description = ?, factor_scores = ?, completed_at = NOW() WHERE id = ?',
            [score, report, JSON.stringify(factorScores), assessmentId]
        );

        return NextResponse.json({ success: true, message: 'تحلیل با موفقیت انجام شد' });

    } catch (error: any) {
        console.error('Finish API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
