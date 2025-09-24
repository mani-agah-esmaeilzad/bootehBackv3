// src/app/api/assessment/chat/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, authenticateToken } from '@/lib/auth';
import { getConnectionWithRetry } from '@/lib/database';
import { getConversationState, saveConversationState } from '@/lib/ai-conversations';
import { continueConversation, analyzeForSecondaryAI } from '@/lib/ai-gemini';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    let connection;
    try {
        const token = extractTokenFromHeader(request.headers.get('authorization'));
        if (!token) return NextResponse.json({ success: false, message: 'توکن ارائه نشده است' }, { status: 401 });
        const decodedToken = authenticateToken(token) as { id: number; };
        
        const assessmentId = parseInt(params.id, 10);
        const { message: userMessage, session_id: sessionId } = await request.json();

        if (!userMessage || !sessionId) {
            return NextResponse.json({ success: false, message: 'پیام یا شناسه جلسه ارائه نشده است' }, { status: 400 });
        }

        connection = await getConnectionWithRetry();
        if (!connection) throw new Error('اتصال به دیتابیس برقرار نشد');

        let conversationState = await getConversationState(sessionId, assessmentId, connection);
        
        conversationState.history.push({ role: 'user', parts: [{ text: userMessage }] });

        const primaryAiResponse = await continueConversation(
            conversationState.history,
            conversationState.personaPrompt || "شما یک مشاور حرفه‌ای هستید."
        );
        conversationState.history.push({ role: 'model', parts: [{ text: primaryAiResponse.text }] });

        let secondaryAiResponseText = null;
        if (conversationState.secondaryPersonaPrompt) {
            const secondaryAiIntervention = await analyzeForSecondaryAI(
                conversationState.history,
                conversationState.secondaryPersonaPrompt
            );
            if (secondaryAiIntervention && !secondaryAiIntervention.includes('__NO_INTERVENTION__')) {
                secondaryAiResponseText = secondaryAiIntervention;
                conversationState.history.push({ role: 'model', parts: [{ text: secondaryAiResponseText }] });
            }
        }
        
        await saveConversationState(sessionId, conversationState, connection);

        const responses = [
            { senderName: conversationState.personaName || "مشاور", text: primaryAiResponse.text }
        ];

        if (secondaryAiResponseText) {
            responses.push({ senderName: conversationState.secondaryPersonaName || "ناظر", text: secondaryAiResponseText });
        }

        return NextResponse.json({
            success: true,
            data: {
                responses: responses,
                isComplete: primaryAiResponse.isComplete,
            }
        });

    } catch (error: any) {
        console.error('Chat API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'خطای سرور' }, { status: 500 });
    } finally {
        if (connection) connection.release();
    }
}
