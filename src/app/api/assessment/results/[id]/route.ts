// src/app/api/assessment/results/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) {
            return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        }
        authenticateToken(token);

        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) {
            return NextResponse.json({ success: false, message: 'ID ارزیابی نامعتبر است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        // ✅ کوئری برای دریافت تمام اطلاعات لازم، شامل factor_scores
        const [rows] = await connection.execute(
            `SELECT 
                a.score, 
                a.description, 
                a.factor_scores,
                q.max_score
             FROM assessments a
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.id = ?`,
            [assessmentId]
        );

        const assessments = rows as any[];
        if (assessments.length === 0) {
            return NextResponse.json({ success: false, message: 'نتیجه ارزیابی یافت نشد' }, { status: 404 });
        }

        const assessment = assessments[0];

        // ✅ تبدیل ستون factor_scores از رشته JSON به آرایه
        let factorScoresArray = [];
        if (assessment.factor_scores && typeof assessment.factor_scores === 'string') {
            try {
                factorScoresArray = JSON.parse(assessment.factor_scores);
            } catch (error) {
                console.error("Failed to parse factor_scores JSON:", error);
                // اگر مشکلی در پارس کردن وجود داشت، یک آرایه خالی برمی‌گردانیم
                factorScoresArray = [];
            }
        } else if (Array.isArray(assessment.factor_scores)) {
            // اگر از قبل جیسون بود
            factorScoresArray = assessment.factor_scores;
        }


        const responseData = {
            success: true,
            data: {
                assessment: {
                    score: assessment.score,
                    max_score: assessment.max_score,
                    description: assessment.description,
                    factor_scores: factorScoresArray // ✅ ارسال آرایه به فرانت‌اند
                }
            }
        };

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('Results API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
