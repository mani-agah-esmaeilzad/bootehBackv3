// src/app/api/assessment/status/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { authenticateToken, extractTokenFromHeader } from '@/lib/auth';
import pool from '@/lib/database';
import { RowDataPacket } from 'mysql2';

export async function GET(request: NextRequest) {
  const token = extractTokenFromHeader(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
  }

  const decodedToken = authenticateToken(token);
  if (!decodedToken || !decodedToken.userId) {
    return NextResponse.json({ success: false, message: 'توکن نامعتبر است' }, { status: 401 });
  }

  try {
    const { userId } = decodedToken;

    const [availableQuestionnaires] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, description FROM questionnaires' // ORDER BY display_order removed
    );
    
    const [completedAssessments] = await pool.query<RowDataPacket[]>(
      'SELECT id, questionnaire_id, score, max_score, factor_scores FROM assessments WHERE user_id = ? AND completed_at IS NOT NULL',
      [userId]
    );

    const completedMap = new Map(
        completedAssessments.map(a => [a.questionnaire_id, {
            id: a.id,
            score: a.score,
            max_score: a.max_score,
            competencies: a.factor_scores ? JSON.parse(a.factor_scores) : []
        }])
    );
    
    let isFirstUncompletedFound = false;
    const assessmentsWithStatus = availableQuestionnaires.map((q) => {
      const completedData = completedMap.get(q.id);
      let status: 'completed' | 'current' | 'locked' = 'locked';

      if (completedData) {
        status = 'completed';
      } else if (!isFirstUncompletedFound) {
        status = 'current';
        isFirstUncompletedFound = true;
      }

      return {
        id: completedData ? completedData.id : q.id,
        questionnaire_id: q.id,
        stringId: `q-${q.id}`,
        title: q.name,
        description: q.description,
        path: `/assessment/start/${q.id}`,
        status,
        score: completedData?.score,
        max_score: completedData?.max_score,
        competencies: completedData?.competencies || [],
      };
    });
    
    if (assessmentsWithStatus.length > 0 && !assessmentsWithStatus.some(a => a.status === 'current')) {
        const firstLocked = assessmentsWithStatus.find(a => a.status === 'locked');
        if (firstLocked) {
            firstLocked.status = 'current';
        }
    }

    // بازگشت به ارسال یک آرایه ساده به جای آبجکت گروه‌بندی شده
    return NextResponse.json({ success: true, data: assessmentsWithStatus });
  } catch (error: any) {
    console.error('Assessment Status Error:', error);
    return NextResponse.json({ success: false, message: 'خطای سرور' }, { status: 500 });
  }
}
