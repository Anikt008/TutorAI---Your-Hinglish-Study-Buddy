import { GoogleGenAI, Chat, Modality } from "@google/genai";
import { ActionType, UserProfile, ChatMessage, Sender } from "../types";

const SYSTEM_INSTRUCTION = `
You are "TutorAI", a friendly, expert Indian tutor. 
Your job is to explain textbook questions, concepts, and videos in simple Hinglish.

GUIDELINES:
1. **Language**: Use "Hinglish" (a natural mix of Hindi and English).
2. **Structure**: 
   - Start with a direct answer or step-by-step solution.
   - Use bold keywords.
   - **IMPORTANT**: At the VERY END of your response (on a new line), strictly output the main topic name in this format: [[TOPIC: Topic Name]].
3. **Analogies**: ALWAYS provide a real-life analogy relevant to India (e.g., Cricket, Traffic, Kirana Shop).
4. **Personalization**:
   - If the user is WEAK in a topic, go extra slow and use very basic examples.
   - If the user is STRONG in a topic, be concise.
   - Address "Common Mistakes" if known.
5. **Tone**: Encouraging, patient, and educational.

If the user asks to "Simplify", use a new story/analogy.
If the user asks for "Notes", generate strict exam-focused notes (bullets, formulas).
`;

// Module-level session storage (Note: In a real prod app, store this in React Context or a Class)
let chatSession: Chat | null = null;

const createClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Please set REACT_APP_API_KEY or VITE_API_KEY.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper to append grounding sources
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
  const strong = profile.strongTopics?.length > 0 ? profile.strongTopics.join(', ') : "None";
  
  let context = `\n[STUDENT CONTEXT]:\n- Weak Topics: [${weak}]\n- Mastered Topics: [${strong}]`;

  if (profile.progressReport?.commonMistakes && profile.progressReport.commonMistakes.length > 0) {
    context += `\n- Common Mistakes to Watch: ${profile.progressReport.commonMistakes.join(', ')}`;
  }
  
  return context;
};

export const startNewSession = async (imageBase64: string, mimeType: string, profile: UserProfile): Promise<string> => {
  const client = createClient();
  
  // VIBE CODE UPGRADE: Using gemini-3-pro-preview for superior visual reasoning
  chatSession = client.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // Gemini 3 Pro supports thinking, we can enable it if needed, but standard config is safer for now
    }
  });

  const response = await chatSession.sendMessage({
    message: {
      role: 'user',
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType || 'image/jpeg'
          }
        },
        {
          text: "Identify this question, categorize it, and explain the solution step-by-step in Hinglish." + getProfileContext(profile)
        }
      ]
    }
  });

  return response.text || "Sorry, I couldn't analyze that image.";
};

export const analyzeYouTubeVideo = async (url: string, profile: UserProfile): Promise<string> => {
  const client = createClient();
  
  chatSession = client.chats.create({
    model: 'gemini-3-pro-preview', // Using 3 Pro for Search Grounding
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }] 
    }
  });

  const prompt = `
  I have provided a YouTube video link: ${url}
  
  TASK:
  1. FIRST, verify the video exists by finding its **Title** and **Channel Name** using Google Search.
  2. If you cannot find the specific video details, stop and say "I couldn't verify this video."
  3. Explain the content in Hinglish STRICTLY based on the video's actual topic.
  
  ${getProfileContext(profile)}
  
  OUTPUT (in Hinglish):
  - **Video Title**: [Title]
  - **Summary**: Strict summary.
  - **Step-by-Step Explanation**: Key concepts.
  - **Real-Life Analogies**: Indian context.
  
  Remember to end with [[TOPIC: Topic Name]].
  `;

  const response = await chatSession.sendMessage({ message: prompt });
  let text = response.text || "Sorry, I couldn't analyze that video link.";
  return appendGroundingSources(response, text);
};

export const sendFollowUp = async (actionOrText: ActionType | string, contextText?: string): Promise<string> => {
  if (!chatSession) throw new Error("Session expired. Please upload the question again.");

  let prompt = "";
  if (Object.values(ActionType).includes(actionOrText as ActionType)) {
      switch (actionOrText) {
        case ActionType.SIMPLIFY:
          prompt = "Mujhe samajh nahi aaya. Explain again using a very simple real-life analogy (story format). Keep it super easy.";
          break;
        case ActionType.NOTES:
          prompt = "Generate 'Exam-Focused Notes'. Include Definition, Formula, Steps, Keywords. Follow CBSE/ICSE pattern.";
          break;
        case ActionType.QUIZ:
          prompt = "Create a short 'Instant Quiz' (3 MCQs) with answers at the end.";
          break;
        default:
          prompt = contextText || "Explain this further.";
      }
  } else {
      prompt = actionOrText as string;
  }

  const response = await chatSession.sendMessage({ message: prompt });
  let text = response.text || "I couldn't generate a response.";
  return appendGroundingSources(response, text);
};

export const generateSpeech = async (text: string): Promise<string> => {
  const client = createClient();
  
  const textWithoutSources = text.split('### 🔗 Reference Sources:')[0];
  const textWithoutTopic = textWithoutSources.split('[[TOPIC:')[0];
  
  let cleanText = textWithoutTopic
    .replace(/\*\*/g, '')
    .replace(/^#+\s/gm, '')
    .replace(/`[^`]*`/g, 'code block')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s]+/g, 'link')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length > 800) cleanText = cleanText.substring(0, 800) + "...";
  if (!cleanText || cleanText.length < 2) cleanText = "Here is the explanation.";

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: cleanText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Puck' }, 
        },
      },
    },
  });

  const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!audioData) throw new Error("No audio generated");
  
  return audioData;
};

export const generateProgressReport = async (history: ChatMessage[]): Promise<{commonMistakes: string[], learningTips: string[]}> => {
  const client = createClient();
  
  const conversationText = history
    .map(msg => `${msg.role}: ${msg.text.substring(0, 200)}`) 
    .join('\n');

  const prompt = `
  Analyze this student's chat history.
  OUTPUT JSON ONLY:
  {
    "commonMistakes": ["List 3 specific types of concepts they struggle with"],
    "learningTips": ["List 3 personalized tips"]
  }
  
  HISTORY:
  ${conversationText}
  `;

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    const json = JSON.parse(response.text || "{}");
    return {
      commonMistakes: json.commonMistakes || [],
      learningTips: json.learningTips || []
    };
  } catch (e) {
    return {
      commonMistakes: ["Keep learning to generate data."],
      learningTips: ["Practice makes perfect!"]
    };
  }
};
