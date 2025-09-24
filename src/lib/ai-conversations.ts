// src/lib/ai-conversations.ts
import { Connection } from 'mysql2/promise';
import { Content } from '@google/generative-ai';

// رابط برای نگهداری وضعیت کامل یک مکالمه
export interface ConversationState {
    history: Content[];
    personaName?: string;
    personaPrompt?: string;
    secondaryPersonaName?: string;
    secondaryPersonaPrompt?: string;
    settings: {
        has_timer: boolean;
        timer_duration: number;
    };
}

// تابع برای ایجاد مکالمه اولیه
export const createInitialConversation = async (
    questionnaireId: number,
    assessmentId: number,
    sessionId: string,
    userId: number,
    connection: Connection
): Promise<{ initialMessage: string, settings: any }> => {
    const [questionnaires] = await connection.execute(
        'SELECT persona_prompt, persona_name, welcome_message, has_timer, timer_duration, secondary_persona_name, secondary_persona_prompt FROM questionnaires WHERE id = ?',
        [questionnaireId]
    );

    const questionnaire = (questionnaires as any[])[0];
    if (!questionnaire) {
        throw new Error('پرسشنامه یافت نشد');
    }

    const initialState: ConversationState = {
        history: [{ role: 'user', parts: [{ text: 'سلام' }] }], // شروع مکالمه
        personaName: questionnaire.persona_name,
        personaPrompt: questionnaire.persona_prompt,
        secondaryPersonaName: questionnaire.secondary_persona_name,
        secondaryPersonaPrompt: questionnaire.secondary_persona_prompt,
        settings: {
            has_timer: !!questionnaire.has_timer,
            timer_duration: questionnaire.timer_duration || 15,
        }
    };
    
    await saveConversationState(sessionId, initialState, connection);
    
    // ذخیره اولین پیام در دیتابیس
    await connection.execute(
        'INSERT INTO chat_messages (assessment_id, session_id, user_id, message_type, content) VALUES (?, ?, ?, ?, ?)',
        [assessmentId, sessionId, userId, 'ai', questionnaire.welcome_message]
    );

    return {
        initialMessage: questionnaire.welcome_message || 'سلام! من مشاور شما هستم. آماده‌اید شروع کنیم؟',
        settings: initialState.settings
    };
};

// ✅ تابع جدید برای بازیابی وضعیت مکالمه
export const getConversationState = async (
    sessionId: string,
    assessmentId: number,
    connection: Connection
): Promise<ConversationState> => {
    const [rows] = await connection.execute(
        'SELECT state_data FROM assessment_states WHERE session_id = ?',
        [sessionId]
    );
    const results = rows as any[];
    if (results.length > 0) {
        return JSON.parse(results[0].state_data);
    }
    // اگر حالتی پیدا نشد، یک حالت اولیه بر اساس پرسشنامه می‌سازیم
    const [qRows] = await connection.execute(
        `SELECT q.persona_prompt, q.persona_name, q.has_timer, q.timer_duration, q.secondary_persona_name, q.secondary_persona_prompt 
         FROM questionnaires q JOIN assessments a ON q.id = a.questionnaire_id 
         WHERE a.id = ?`,
        [assessmentId]
    );
    const questionnaire = (qRows as any[])[0];
    if (!questionnaire) throw new Error('اطلاعات پرسشنامه برای این جلسه یافت نشد.');

    return {
        history: [],
        personaName: questionnaire.persona_name,
        personaPrompt: questionnaire.persona_prompt,
        secondaryPersonaName: questionnaire.secondary_persona_name,
        secondaryPersonaPrompt: questionnaire.secondary_persona_prompt,
        settings: {
            has_timer: !!questionnaire.has_timer,
            timer_duration: questionnaire.timer_duration || 15,
        }
    };
};

// ✅ تابع جدید برای ذخیره وضعیت مکالمه
export const saveConversationState = async (
    sessionId: string,
    state: ConversationState,
    connection: Connection
): Promise<void> => {
    const stateJson = JSON.stringify(state);
    await connection.execute(
        `INSERT INTO assessment_states (session_id, state_data) 
         VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE state_data = ?`,
        [sessionId, stateJson, stateJson]
    );
};
