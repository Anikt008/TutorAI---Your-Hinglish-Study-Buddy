export enum Sender {
  User = 'user',
  Bot = 'model'
}

export interface ChatMessage {
  id: string;
  role: Sender;
  text: string;
  image?: string; // Base64 string
  isAudioPlaying?: boolean;
}

export interface UserProfile {
  weakTopics: string[];
  strongTopics: string[];
  totalSessions: number;
  progressReport?: ProgressReport;
}

export interface ProgressReport {
  commonMistakes: string[];
  learningTips: string[];
  generatedAt: number;
}

export interface AppState {
  chatHistory: ChatMessage[];
  isLoading: boolean;
  currentMode: 'upload' | 'chat';
  error: string | null;
  userProfile: UserProfile;
}

export enum ActionType {
  SIMPLIFY = 'simplify',
  NOTES = 'notes',
  QUIZ = 'quiz',
  EXPLAIN = 'explain'
}