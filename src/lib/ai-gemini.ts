// src/lib/ai-gemini.ts
import { GoogleGenerativeAI, Content, GenerationConfig } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable not set.");
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const generationConfig: GenerationConfig = {
    temperature: 0.7,
    topP: 1,
    topK: 1,
    maxOutputTokens: 2048,
};

// ✅ تابع جدید برای ادامه مکالمه با AI اصلی
export const continueConversation = async (
    history: Content[],
    personaPrompt: string
): Promise<{ text: string, isComplete: boolean }> => {
    const chat = model.startChat({
        history,
        generationConfig,
        systemInstruction: personaPrompt,
    });

    const result = await chat.sendMessage(history[history.length - 1].parts);
    const responseText = result.response.text();

    const isComplete = responseText.toLowerCase().includes("[end_of_conversation]");
    const cleanedText = responseText.replace(/\[end_of_conversation\]/gi, "").trim();

    return { text: cleanedText, isComplete };
};

// ✅ تابع جدید برای تحلیل و مداخله AI دوم
export const analyzeForSecondaryAI = async (
    history: Content[],
    secondaryPersonaPrompt: string
): Promise<string> => {
    const systemInstruction = `${secondaryPersonaPrompt}\n\nشما یک ناظر مکالمه هستید. این تاریخچه مکالمه بین یک کاربر و یک مشاور است. وظیفه شما این است که بر اساس نقش خود، بررسی کنید آیا نیاز به مداخله دارید یا خیر. اگر نیاز به مداخله بود، پیام خود را بنویسید. در غیر این صورت، فقط و فقط عبارت '__NO_INTERVENTION__' را برگردانید.`;
    
    const result = await model.generateContent({
        contents: history,
        generationConfig,
        systemInstruction,
    });
    
    return result.response.text();
};


// تابع تحلیل مکالمه برای گزارش نهایی (بدون تغییر)
export const analyzeConversation = async (
    historyJson: string,
    analysisPrompt: string
): Promise<string> => {
    const fullPrompt = `${analysisPrompt}\n\n تاریخچه مکالمه به صورت JSON:\n${historyJson}`;
    const result = await model.generateContent(fullPrompt);
    return result.response.text();
};

// تابع تولید سوالات تکمیلی (بدون تغییر)
export const generateSupplementaryQuestions = async (
    historyJson: string,
    personaPrompt: string
): Promise<{ q1: string, q2: string }> => {
    const fullPrompt = `بر اساس تاریخچه مکالمه زیر و با توجه به اینکه شخصیت مصاحبه‌گر این بوده است: "${personaPrompt}", دو سوال تکمیلی هوشمندانه و کوتاه برای درک عمیق‌تر کاربر طراحی کن. خروجی باید فقط یک JSON با کلیدهای "q1" و "q2" باشد.\n\n${historyJson}`;
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(text);
};
