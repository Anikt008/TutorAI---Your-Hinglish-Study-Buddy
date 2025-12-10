


import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { ActionType, UserProfile, ChatMessage, RevisionPlan } from "../types";

const SYSTEM_INSTRUCTION = `
You are "TutorAI", a friendly, expert Indian tutor. 
Your job is to explain textbook questions, concepts, and videos in simple Hinglish.

GUIDELINES:
1. **Language**: "Hinglish" (Hindi + English mix). Simple words.
2. **Structure**: 
   - Direct answer first.
   - Step-by-step logic.
   - **Analogy**: Always use a real-life Indian analogy (Cricket, Chai, Traffic, etc.).
   - **Topic Tag**: End with [[TOPIC: Topic Name]].
3. **Smart Modes**:
   - If asked for **ELI5**: Explain like a bedtime story for a 5-year-old.
   - If asked for **DIAGRAM**: Use ASCII art or Mermaid syntax to visualize.
   - If asked for **MNEMONIC**: Give a funny, memorable trick/rhyme.
   - If asked for **REVISION**: Bullet points, < 60 words.
   
4. **Tone**: Encouraging, like an elder brother/sister.
`;

let chatSession: Chat | null = null;

// --- FALLBACK MOCK ENGINE ---
// This runs if API Key is missing or network fails
const getMockResponse = (input: string, action?: ActionType): string => {
  // New logic for specific keywords
  const lowerInput = input ? input.toLowerCase() : "";
  
  if (lowerInput.includes("photosynthesis")) {
      return `🌿 **Photosynthesis Process:**\n\n**Flow:**\nSunlight ☀️ → Chlorophyll 🍃 → Food 🍎 → Energy ⚡\n\n**Simple Definition:**\nJaise hum kitchen mein khana banate hain, plants **Leaves** mein khana banate hain using Sunlight and Water.\n\n[[TOPIC: Biology]]`;
  }

  if (lowerInput.includes("balance sheet")) {
      return `💰 **Balance Sheet Concept:**\n\n**Flow:**\nAssets 🏠 → Liabilities 💳 → Equity 💼\n\n**Simple Definition:**\nBalance Sheet ek "financial snapshot" hai. Ye batata hai ki company ke paas aaj kya hai (Assets) aur use udhaar kitna chukana hai (Liabilities).\n\nFormula: **Assets = Liabilities + Equity**\n\n[[TOPIC: Accounting]]`;
  }

  const genericTopic = "Physics/Math Concept";
  
  const mocks: Record<string, string> = {
    [ActionType.ELI5]: `👶 **Baby Explanation:**\nImagine you have a toy car. Inertia is like when you push the car, it keeps moving until it hits a wall. Simple na?\n\n[[TOPIC: Inertia]]`,
    [ActionType.MNEMONIC]: `🧠 **Memory Trick:**\nYaad rakho: "My Very Educated Mother Just Served Us Noodles"\n(Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune)\n\n[[TOPIC: Solar System]]`,
    [ActionType.DIAGRAM]: `📐 **Visual Diagram:**\n\`\`\`\n   [ Force ] ---> [ Object ] ---> [ Acceleration ]\n\`\`\`\nMore force = More speed!\n\n[[TOPIC: Newton's 2nd Law]]`,
    [ActionType.REVISION]: `⚡ **1-Minute Revision:**\n- Force = Mass x Acceleration (F=ma)\n- Unit is Newton (N)\n- It is a vector quantity (direction matters)\n\n[[TOPIC: Force]]`,
    [ActionType.QUIZ]: `❓ **Practice Question:**\nQ: What is the unit of Force?\nA) Joule\nB) Newton\nC) Watt\n\n(Answer: B)`,
    "default": `🤖 **Offline Mode:**\nMujhe exact answer internet se nahi mila, par concept simple hai. Usually, textbook questions formula based hote hain. Try breaking it down:\n1. Given kya hai?\n2. Formula konsa lagega?\n3. Calculate karo.\n\n(Please check your API Key to get smart AI answers!)`
  };

  return mocks[action as string] || mocks["default"];
};

const createClient = () => {
  const apiKey = process.env.API_KEY; 
  if (!apiKey) {
    throw new Error("MISSING_KEY"); // Signal to switch to offline mode
  }
  return new GoogleGenAI({ apiKey });
};

// ... (cleanJson, appendGroundingSources, getProfileContext kept same as before) ...
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : "{}";
};

const appendGroundingSources = (response: any, text: string): string => {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!chunks || chunks.length === 0) return text;
  
  let sourcesMarkdown = '\n\n### 🔗 Reference Sources:\n';
  const uniqueLinks = new Set<string>();
  
  chunks.forEach((chunk: any) => {
     if (chunk.web?.uri && !uniqueLinks.has(chunk.web.uri)) {
       uniqueLinks.add(chunk.web.uri);
       sourcesMarkdown += `- [${chunk.web.title || 'Source'}](${chunk.web.uri})\n`;
     }
  });
  
  return text + sourcesMarkdown;
};

const getProfileContext = (profile: UserProfile): string => {
  if (!profile) return "";
  const weak = profile.weakTopics?.length > 0 ? profile.weakTopics.join(', ') : "None";
  return `\n[STUDENT CONTEXT]:\n- Weak Topics: [${weak}]`;
};

export const startNewSession = async (imageBase64: string | null, mimeType: string | null, profile: UserProfile, textQuery?: string): Promise<string> => {
  try {
    const client = createClient();
    
    chatSession = client.chats.create({
      model: 'gemini-3-pro-preview',
      config: { systemInstruction: SYSTEM_INSTRUCTION }
    });

    const parts: any[] = [];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType: mimeType } });
    }
    const queryText = textQuery || "Identify this question, categorize it, and explain the solution step-by-step in Hinglish.";
    parts.push({ text: queryText + getProfileContext(profile) });

    const response = await chatSession.sendMessage({ message: { role: 'user', parts: parts } });
    return response.text || "Sorry, I couldn't analyze that.";

  } catch (error: any) {
    if (error.message === "MISSING_KEY" || error.toString().includes("API key")) {
      throw new Error("OFFLINE_MODE");
    }
    console.error(error);
    throw error;
  }
};

export const analyzeYouTubeVideo = async (url: string, profile: UserProfile): Promise<string> => {
  try {
    const client = createClient();
    chatSession = client.chats.create({
      model: 'gemini-3-pro-preview',
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools: [{ googleSearch: {} }] }
    });
    const prompt = `YouTube Link: ${url}. Verify title. Explain content in Hinglish based on video topic. ${getProfileContext(profile)}. End with [[TOPIC: Name]].`;
    const response = await chatSession.sendMessage({ message: prompt });
    return appendGroundingSources(response, response.text || "Could not analyze video.");
  } catch (error: any) {
     if (error.message === "MISSING_KEY") throw new Error("OFFLINE_MODE");
     throw error;
  }
};

export const sendFollowUp = async (actionOrText: ActionType | string): Promise<string> => {
  // Mock Mode Check
  if (!chatSession) {
      // If no session but we want to simulate a response (e.g. offline mode started directly)
      // For now, we throw error to trigger offline handler in App.tsx
      throw new Error("OFFLINE_MODE");
  }

  try {
    let prompt = "";
    if (Object.values(ActionType).includes(actionOrText as ActionType)) {
        switch (actionOrText) {
          case ActionType.SIMPLIFY: prompt = "Simplify this further with a story analogy."; break;
          case ActionType.NOTES: prompt = "Generate Exam Notes (Bullets, Formulas)."; break;
          case ActionType.QUIZ: prompt = "Create 3 MCQs with answers at the end."; break;
          case ActionType.ELI5: prompt = "Explain it like I am a 5 year old kid (ELI5). Use emoji stories."; break;
          case ActionType.DIAGRAM: prompt = "Create a text-based visual diagram (ASCII or Flowchart) to explain this."; break;
          case ActionType.MNEMONIC: prompt = "Give me a funny mnemonic or memory trick to remember this."; break;
          case ActionType.REVISION: prompt = "Give me a 1-minute quick revision summary."; break;
          case ActionType.PRACTICE: prompt = "Give me 3 practice questions (Easy, Medium, Hard)."; break;
          default: prompt = "Explain further.";
        }
    } else {
        prompt = actionOrText as string;
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return appendGroundingSources(response, response.text || "No response.");
  } catch (error: any) {
    if (error.message === "MISSING_KEY") throw new Error("OFFLINE_MODE");
    // If session matches mock logic
    return getMockResponse("Follow Up", actionOrText as ActionType);
  }
};

export const generateSpeech = async (text: string): Promise<string> => {
  try {
    const client = createClient();
    let cleanText = text.replace(/###.*?(\n|$)/g, '').replace(/\[\[TOPIC:.*?\]\]/g, '').replace(/[*#`]/g, '');
    if (cleanText.length > 800) cleanText = cleanText.substring(0, 800);

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
      },
    });
    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio");
    return audioData;
  } catch (e) {
    console.warn("TTS Failed, might be offline");
    throw e; 
  }
};

export const generateProgressReport = async (history: ChatMessage[]): Promise<{commonMistakes: string[], learningTips: string[]}> => {
  try {
    const client = createClient();
    const conversationText = history.map(msg => `[${msg.role}]: ${msg.text}`).join('\n');
    const prompt = `Analyze history. JSON output: { "commonMistakes": [], "learningTips": [] }. History: ${conversationText}`;

    const response = await client.models.generateContent({
      model: "gemini-3-pro-preview", 
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (e) {
    return { commonMistakes: ["Server unreachable"], learningTips: ["Check internet connection"] };
  }
};

export const generateRevisionPlan = async (profile: UserProfile): Promise<RevisionPlan> => {
  try {
    const client = createClient();
    const weak = profile.weakTopics.join(", ");
    const prompt = `User weak in: ${weak}. Generate 1-day plan. JSON: { "topic": "Topic", "tasks": ["Task 1", "Task 2"] }`;

    const response = await client.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (e) {
    return { topic: "Offline Plan", tasks: ["Review your Textbook", "Practice solved examples"] };
  }
};

// Exporting the Mock Generator for App.tsx to use directly if needed
export const getOfflineResponse = getMockResponse;
