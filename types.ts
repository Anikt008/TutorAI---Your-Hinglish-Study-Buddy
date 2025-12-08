export enum Sender {
  User = 'user',
  Bot = 'model'
}

export interface ChatMessage {
  id: string;
  role: Sender;
  text: string;
  image?: string;
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

export enum ActionType {
  SIMPLIFY = 'simplify',
  NOTES = 'notes',
  QUIZ = 'quiz',
  EXPLAIN = 'explain'
}

// Reducer Types
export interface AppState {
  messages: ChatMessage[];
  isLoading: boolean;
  currentMode: 'upload' | 'chat';
  error: string | null;
  userProfile: UserProfile;
  isProfileOpen: boolean;
  youtubeLink: string;
  isListening: boolean; // For Voice Input
}

export type AppAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_MODE'; payload: 'upload' | 'chat' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'TOGGLE_PROFILE'; payload: boolean }
  | { type: 'SET_YOUTUBE_LINK'; payload: string }
  | { type: 'SET_LISTENING'; payload: boolean }
  | { type: 'RESET_APP' }
  | { type: 'UPDATE_MESSAGE_AUDIO'; payload: { id: string; isPlaying: boolean } };
