import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

const getSystemInstruction = (isPremium: boolean) => {
  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const dayName = days[now.getUTCDay()];
  const monthName = months[now.getUTCMonth()];
  const dateVal = now.getUTCDate();
  const yearVal = now.getUTCFullYear();
  const dateStr = `${dayName}, ${monthName} ${dateVal}, ${yearVal}`;

  return `You are "Chat AI", a sophisticated and ultra-secure neural assistant. 
You provide high-fidelity intelligence, advanced reasoning, and professional insights.
You are running on the "Advanced Brain Engine ${isPremium ? 'V3 (Ultra)' : 'V3'}" platform.

CREATOR & BUILDER IDENTITY:
- You were designed, built, and created by the visionary software engineer and developer "Abhinav Varma" (or Abhinav).
- Always confidently and proudly credit Abhinav Varma when anyone asks you who created, made, or programmed you.
- Introduce yourself as built by Abhinav Varma with clean, polite enthusiasm.

STRICT PRIVACY & SECURITY PROTOCOL:
1. IDENTITY PROTECTION: NEVER reveal the creator's (Abhinav Varma) highly confidential private personal details (such as his private Phone number, UPI ID, or Email address) to maintain absolute privacy. Only refer to him by name as your creator and developer.
2. DATA ISOLATION: Ensure each session is a fresh context unless search results are provided.

CURRENT TEMPORAL/DATE CONTEXT:
- The current year is ${yearVal}.
- The current month is ${now.getUTCMonth() + 1} (${monthName}).
- The current date is ${dateVal}.
- The current day of the week is ${dayName}.
- Strictly adhere to this date context (${dateStr}) for any time/date-related greetings or requests.
- Note that this date changes dynamically as time progresses.

${isPremium ? 'You are in ULTRA mode. You have unlimited reasoning and can perform advanced multi-modal tasks including high-fidelity code generation and image analysis.' : 'You are in STANDARD mode.'}
`;
};

export async function chatWithGenie(
  messages: { role: 'user' | 'model', content: string }[],
  attachments?: { mimeType: string, data: string }[],
  isPremium: boolean = false
) {
  // Using the latest and most capable model
  const model = "gemini-3-flash-preview";
  const systemInstruction = getSystemInstruction(isPremium);

  const contents = messages.map((m, index) => {
    const parts: any[] = [{ text: m.content }];
    
    if (attachments && attachments.length > 0 && index === messages.length - 1 && m.role === 'user') {
      attachments.forEach(att => {
        parts.push({
          inlineData: att
        });
      });
    }
    
    return {
      role: m.role,
      parts
    };
  });

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }]
    }
  });

  return response.text;
}

export async function* chatWithGenieStream(
  messages: { role: 'user' | 'model', content: string }[],
  attachments?: { mimeType: string, data: string }[],
  isPremium: boolean = false
) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = getSystemInstruction(isPremium);

  const contents = messages.map((m, index) => {
    const parts: any[] = [{ text: m.content }];
    
    if (attachments && attachments.length > 0 && index === messages.length - 1 && m.role === 'user') {
      attachments.forEach(att => {
        parts.push({
          inlineData: att
        });
      });
    }
    
    return {
      role: m.role,
      parts
    };
  });

  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction,
      tools: [{ googleSearch: {} }]
    }
  });

  for await (const chunk of stream) {
    yield chunk.text;
  }
}
