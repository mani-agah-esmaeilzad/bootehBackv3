// src/app/api/admin/reports/[id]/route.ts

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
        
        const decodedToken = authenticateToken(token) as { id: number; role: string; };
        if (!decodedToken || decodedToken.role !== 'admin') {
            return NextResponse.json({ success: false, message: 'دسترسی غیر مجاز' }, { status: 403 });
        }

        const assessmentId = parseInt(params.id, 10);
        if (isNaN(assessmentId)) {
            return NextResponse.json({ success: false, message: 'ID ارزیابی نامعتبر است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) {
            throw new Error('اتصال به دیتابیس برقرار نشد');
        }

        // ========== شروع بخش عیب‌یابی با لاگ ==========
        console.log(`\n🔍 [DEBUG] Fetching report for Assessment ID: ${assessmentId}`);

        // 1. آیا ارزیابی با این ID وجود دارد؟
        const [assessmentCheck] = await connection.execute('SELECT * FROM assessments WHERE id = ?', [assessmentId]);
        const assessmentResult = (assessmentCheck as any[])[0];
        if (!assessmentResult) {
            console.error(`❌ [DEBUG] Assessment with ID ${assessmentId} NOT FOUND.`);
            return NextResponse.json({ success: false, message: 'گزارش یافت نشد (ارزیابی وجود ندارد)' }, { status: 404 });
        }
        console.log(`✔️ [DEBUG] Assessment Found:`, { id: assessmentResult.id, user_id: assessmentResult.user_id, questionnaire_id: assessmentResult.questionnaire_id });

        // 2. آیا کاربر مربوط به این ارزیابی وجود دارد؟
        const [userCheck] = await connection.execute('SELECT id, username FROM users WHERE id = ?', [assessmentResult.user_id]);
        if ((userCheck as any[]).length === 0) {
            console.error(`❌ [DEBUG] User with ID ${assessmentResult.user_id} NOT FOUND for this assessment.`);
            return NextResponse.json({ success: false, message: 'گزارش یافت نشد (کاربر مربوطه حذف شده است)' }, { status: 404 });
        }
        console.log(`✔️ [DEBUG] User Found:`, (userCheck as any[])[0]);

        // 3. آیا پرسشنامه مربوط به این ارزیابی وجود دارد؟
        const [questionnaireCheck] = await connection.execute('SELECT id, name FROM questionnaires WHERE id = ?', [assessmentResult.questionnaire_id]);
         if ((questionnaireCheck as any[]).length === 0) {
            console.error(`❌ [DEBUG] Questionnaire with ID ${assessmentResult.questionnaire_id} NOT FOUND for this assessment.`);
            return NextResponse.json({ success: false, message: 'گزارش یافت نشد (پرسشنامه مربوطه حذف شده است)' }, { status: 404 });
        }
        console.log(`✔️ [DEBUG] Questionnaire Found:`, (questionnaireCheck as any[])[0]);
        // ========== پایان بخش عیب‌یابی با لاگ ==========

        // اگر همه چیز درست بود، کوئری اصلی را اجرا کن
        const [rows] = await connection.execute(
            `SELECT 
                a.id, a.score, a.description, a.completed_at, a.factor_scores,
                u.username, u.email,
                q.name as questionnaire_title,
                q.max_score
             FROM assessments a
             JOIN users u ON a.user_id = u.id
             JOIN questionnaires q ON a.questionnaire_id = q.id
             WHERE a.id = ?`,
            [assessmentId]
        );

        const reports = rows as any[];
        if (reports.length === 0) {
            // این پیام نباید دیگر نمایش داده شود مگر اینکه مشکل دیگری باشد
            console.error(` unexplained error: JOIN failed for Assessment ID: ${assessmentId}`);
            return NextResponse.json({ success: false, message: 'گزارش یافت نشد' }, { status: 404 });
        }

        const report = reports[0];
        let factorScoresArray = [];
        if (report.factor_scores) {
             try {
                factorScoresArray = typeof report.factor_scores === 'string'
                    ? JSON.parse(report.factor_scores)
                    : report.factor_scores;
            } catch (error) {
                console.error("Failed to parse factor_scores JSON for admin report:", error);
                factorScoresArray = [];
            }
        }
        
        const responseData = {
            success: true,
            data: { ...report, factor_scores: factorScoresArray }
        };

        return NextResponse.json(responseData);

    } catch (error: any) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             return NextResponse.json({ success: false, message: 'توکن نامعتبر یا منقضی شده است' }, { status: 401 });
        }
        console.error('Admin Report Detail API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
