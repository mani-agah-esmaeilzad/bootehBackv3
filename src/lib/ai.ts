import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const AVALAI_API_KEY = process.env.AVALAI_API_KEY || '';
const AVALAI_BASE_URL = process.env.AVALAI_BASE_URL || 'https://api.avalai.ir/v1';
const DEFAULT_MODEL = "gemini-2.0-flash-lite"; // می‌توانید مدل پیش‌فرض را اینجا تغییر دهید

if (!AVALAI_API_KEY) {
  throw new Error("AVALAI_API_KEY environment variable not set.");
}

const openai = new OpenAI({
    apiKey: AVALAI_API_KEY,
    baseURL: AVALAI_BASE_URL,
});

// اینترفیس برای پیام‌های ورودی، سازگار با فرمت OpenAI
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * تابع اصلی برای تولید پاسخ با استفاده از AvalAI
 * @param systemInstruction دستورالعمل کلی برای مدل
 * @param history تاریخچه مکالمه
 * @param model نام مدلی که می‌خواهید استفاده کنید (مثلا gpt-4o-mini)
 * @returns {Promise<string | null>} پاسخ تولید شده توسط مدل
 */
export const generateResponse = async (
  systemInstruction: string,
  history: ChatMessage[],
  model: string = DEFAULT_MODEL
): Promise<string | null> => {
  if (history.length === 0) {
    console.error("generateResponse called with empty history.");
    return "مشکلی در بازیابی تاریخچه مکالمه پیش آمده است.";
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemInstruction },
    ...history,
  ];

  try {
    const chatCompletion = await openai.chat.completions.create({
        messages: messages,
        model: model,
        temperature: 0.7,
    });
    return chatCompletion.choices[0]?.message?.content || null;
  } catch (error: any) {
    console.error("AvalAI API Error in generateResponse:", error);
    return "متاسفانه در حال حاضر قادر به پاسخگویی نیستم. لطفاً لحظاتی دیگر دوباره تلاش کنید.";
  }
};

/**
 * تابع برای تولید هوشمند سوالات تکمیلی
 * @param conversationJson تاریخچه مکالمه به صورت رشته JSON
 * @param personaPrompt پرامپت اصلی شخصیت
 * @returns {Promise<{ q1: string, q2: string }>} دو سوال تکمیلی
 */
export const generateSupplementaryQuestions = async (conversationJson: string, personaPrompt: string): Promise<{ q1: string, q2: string }> => {
    try {
        const systemPrompt = `You are an expert HR interviewer. Your task is to generate two insightful follow-up questions in Persian based on the provided conversation history and the original persona prompt. The questions should probe deeper into areas where the user was vague, or challenge them on a key competency related to the persona. **Output ONLY a valid JSON object with two keys: "question1" and "question2". Do not add any other text.**`;
        
        const userPrompt = `
            **Original Persona Prompt:**
            ${personaPrompt}

            **Conversation History (JSON):**
            ${conversationJson}
        `;

        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            response_format: { type: "json_object" },
        });

        const textResult = response.choices[0]?.message?.content;
        if (textResult) {
            const parsed = JSON.parse(textResult);
            return {
                q1: parsed.question1 || "سوال اول ایجاد نشد.",
                q2: parsed.question2 || "سوال دوم ایجاد نشد."
            };
        }
        throw new Error("AI did not return valid content for supplementary questions.");
    } catch (error) {
        console.error("Error generating supplementary questions:", error);
        return {
            q1: "بر اساس مکالمه‌ای که داشتیم، فکر می‌کنید بزرگترین نقطه قوت شما که در این سناریو به نمایش گذاشته شد چه بود؟",
            q2: "با توجه به چالش مطرح شده، فکر می‌کنید در کدام بخش نیاز به بهبود و یادگیری بیشتری دارید؟"
        };
    }
};

/**
 * تابع برای تحلیل نهایی مکالمه و تولید گزارش
 * @param conversationJson تاریخچه مکالمه به صورت رشته JSON
 * @param analysisPrompt پرامپت تحلیل که توسط ادمین تعریف شده
 * @returns {Promise<string>} متن تحلیل نهایی
 */
export const analyzeConversation = async (conversationJson: string, analysisPrompt: string): Promise<string> => {
    try {
        const prompt = `
            ${analysisPrompt}
            
            This is the conversation history in JSON format. Analyze it based on the instructions above.
            Conversation:
            ${conversationJson}
            
            Begin Analysis (in Persian):
        `;
        const response = await openai.chat.completions.create({
            model: DEFAULT_MODEL,
            messages: [ { role: "user", content: prompt } ]
        });
        return response.choices[0]?.message?.content || "تحلیل مکالمه با خطا مواجه شد.";
    } catch (error) {
        console.error("Error analyzing conversation:", error);
        return "تحلیل مکالمه با خطا مواجه شد.";
    }
};
