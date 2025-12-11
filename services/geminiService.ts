import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { ActionType, UserProfile, ChatMessage, RevisionPlan } from "../types";

const SYSTEM_INSTRUCTION = `
You are TutorAI, a super-fast Hinglish study assistant.

**STRICT RULES FOR SPEED:**
1. **Response Time:** Instant. No deep thinking steps.
2. **Length:** 4–6 simple Hinglish lines ONLY.
3. **Content:** Key points + 1 simple example. No long reasoning.
4. **Language:** Natural Hinglish (Hindi + English).
5. **Topic Tag:** ALWAYS end with [[TOPIC: Topic Name]].

**Example Output:**
Newton's 1st Law (Inertia) kehta hai ki agar koi cheez ruki hai, toh wo ruki rahegi jab tak us par force na lage.
Example: Bus break lagti hai toh hum aage girte hain kyunki body move karna chahti hai.
Bus yahi Inertia hai. Simple!
[[TOPIC: Physics]]

**Smart Modes** (Override ONLY if specifically requested):
- **ELI5**: One short analogy.
- **DIAGRAM**: ASCII art only.
- **MNEMONIC**: One line memory trick.
`;

let chatSession: Chat | null = null;

// --- FALLBACK MOCK ENGINE ---
// This runs if API Key is missing or network fails
const getMockResponse = (input: string, action?: ActionType): string => {
  const lowerInput = input ? input.toLowerCase() : "";
  
  // 1. Specific Topic Handling (Demo ke liye best questions)
  if (lowerInput.includes("photosynthesis")) {
      return `🌿 **Photosynthesis (Offline Mode):**\n\n**Process:**\nSunlight ☀️ + Water 💧 + CO2 🌬️ → Food (Glucose) 🍎 + Oxygen 🌬️\n\n**Analogy:**\nJaise Mummy kitchen me gas aur sabzi use karke khana banati hain, waise hi plants **Leaves (Chlorophyll)** me sunlight use karke khana banate hain.\n\n[[TOPIC: Biology]]`;
  }

  if (lowerInput.includes("balance sheet")) {
      return `💰 **Balance Sheet (Offline Mode):**\n\n**Formula:** Assets = Liabilities + Equity\n\n**Concept:**\nYe ek business ka "Report Card" hai.\n- **Assets:** Jo tumhare paas hai (Cash, Building).\n- **Liabilities:** Jo udhaar chukana hai (Loans).\n\n[[TOPIC: Accounting]]`;
  }
  
  if (lowerInput.includes("newton") || lowerInput.includes("law")) {
      return `🍎 **Newton's Laws (Offline Mode):**\n\n**Law 1 (Inertia):** Cheezein rukna ya chalna continue karti hain jab tak force na lage.\n**Law 2 (F=ma):** Zyada mass = Zyada force chahiye hilane ke liye.\n**Law 3 (Action-Reaction):** Har action ka equal opposite reaction hota hai.\n\n[[TOPIC: Physics]]`;
  }

  // 2. YouTube Handling
  if (lowerInput.includes("youtube.com") || lowerInput.includes("youtu.be")) {
      return `⚠️ **Offline Mode:**\nMain video analyze nahi kar sakta bina internet ke, par ye **Study Tips** follow karo:\n\n1. **Speed:** 1.5x pe dekho time bachane ke liye.\n2. **Notes:** Video ke beech me pause karke key points likho.\n3. **Summary:** Khud se poocho "Is video ka main point kya tha?"`;
  }

  // 3. Smart Action Handlers (Buttons like "Simplify", "Notes")
  const mocks: Record<string, string> = {
    [ActionType.SIMPLIFY]: `🤯 **Simplified (Offline):**\nImagine karo ye ek game ki tarah hai. Jab tak tum start button nahi dabate, game pause rehta hai. Ye concept bhi waisa hi hai!\n\n(Connect to internet for better analogies!)`,
    [ActionType.ELI5]: `👶 **ELI5 (Offline):**\nSocho tumhare paas ek bada pizza hai. Agar tum use doston me baatoge, toh sabko kam milega. Yahi concept yahan apply hota hai divide karne par.\n\n[[TOPIC: Math]]`,
    [ActionType.MNEMONIC]: `🧠 **Memory Trick (Offline):**\nEk funny sentence banao words ke first letters se.\nExample: **V**iolet **I**ndigo **B**lue... -> "VIBGYOR"`,
    [ActionType.DIAGRAM]: `📐 **Visual Diagram (Offline):**\n\`\`\`\n   [ Input ] ---> [ Process ] ---> [ Output ]\n\`\`\`\nOffline diagram: Data flow aise hota hai.\n\n[[TOPIC: Logic]]`,
    [ActionType.REVISION]: `⚡ **1-Minute Revision (Offline):**\n- Main Definition yaad karlo.\n- Formula rat lo.\n- Unit: SI Units hamesha check karo.\n\n[[TOPIC: Revision]]`,
    [ActionType.NOTES]: `📝 **Offline Notes:**\n- Keywords underline karna.\n- Exam me diagram banana mat bhoolna.\n- Point-wise answers likhna.`,
    [ActionType.QUIZ]: `❓ **Offline Quiz:**\nQ: Is concept ka main unit kya hai?\nA) Joule\nB) Newton\nC) Watt\n\n(Khud socho! Answer B ho sakta hai 😉)`,
    [ActionType.PRACTICE]: `✍️ **Practice (Offline):**\n1. Textbook ka example 3 solve karo.\n2. Previous year paper check karo.\n3. Formula bina dekhe likho.`,
  };

  if (action && mocks[action]) {
    return mocks[action];
  }

  // 4. Generic Fallback (Smart Echo)
  // Agar kuch match na ho, to user ke input ko use karke smart lago
  return `🤖 **Offline Mode Active:**\n\nMaine tumhara question padha: _"${input ? input.substring(0, 50) : 'Question'}..."_\n\nInternet connect nahi hai, par ye steps follow karo solve karne ke liye:\n1. **Question samjho:** Kya pucha gaya hai?\n2. **Formula dhundo:** Apni textbook ke index me topic check karo.\n3. **Step-by-step:** Bada problem chote parts me todo.\n\n(Please check your API Key/Internet for full AI power!)`;
};

const createClient = () => {
  const apiKey = process.env.API_KEY; 
  if (!apiKey) {
    throw new Error("MISSING_KEY"); // Signal to switch to offline mode
  }
  return new GoogleGenAI({ apiKey });
};

// IMPROVED: Robust JSON cleaner that removes Markdown code blocks
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  // Remove markdown code blocks if present (```json ... ```)
  let clean = text.replace(/```json/g, "").replace(/```/g, "");
  // Find the first '{' and last '}'
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    return clean.substring(start, end + 1);
  }
  return "{}";
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
      model: 'gemini-2.5-flash',
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
  // Check for API Key validity before attempting connection
  if (!process.env.API_KEY) {
    return getMockResponse(url);
  }

  try {
    const client = createClient();
    chatSession = client.chats.create({
      // Switched to Flash for faster analysis
      model: 'gemini-2.5-flash',
      // We use googleSearch to effectively 'getVideoInfo' and analyze content
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools: [{ googleSearch: {} }] }
    });
    
    const prompt = `You are TutorAI. 
Is YouTube link ka title, description, tags aur publicly visible metadata dekh kar 
simple Hinglish me explanation do.

Return these sections:
1. Summary (3 lines)
2. Key Points (5 bullets)
3. Real-Life Example
4. 1-Minute Revision Notes

Link: ${url}

${getProfileContext(profile)}

IMPORTANT: End your response with [[TOPIC: Topic Name]] for categorization.`;

    const response = await chatSession.sendMessage({ message: prompt });
    return appendGroundingSources(response, response.text || "Could not analyze video.");
  } catch (error: any) {
     if (error.message === "MISSING_KEY") throw new Error("OFFLINE_MODE");
     return "Sorry, I encountered an error analyzing the video.";
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
    // Clean text more aggressively for TTS
    let cleanText = text.replace(/###/g, '')
                        .replace(/\*\*/g, '')
                        .replace(/\[\[TOPIC:.*?\]\]/g, '')
                        .replace(/`/g, '')
                        .replace(/\[Source\]\(.*?\)/g, '');
                        
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
    // Use the robust cleanJson function
    return JSON.parse(cleanJson(response.text || "{}"));
  } catch (e) {
    console.error("Progress Report Error:", e);
    // Return safe default data on failure so ProfileModal doesn't crash
    return { commonMistakes: ["Offline mode active: Cannot analyze."], learningTips: ["Check back when online."] };
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