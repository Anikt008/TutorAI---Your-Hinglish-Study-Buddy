
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
  type?: 'text' | 'diagram' | 'error';
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

export interface RevisionPlan {
  topic: string;
  tasks: string[];
}

export interface UserProfile {
  name: string;
  weakTopics: string[];
  strongTopics: string[];
  totalSessions: number;
  streakDays: number;
  lastStudyDate: string; // ISO date string
  progressReport?: ProgressReport;
  revisionPlan?: RevisionPlan;
}

export interface ProgressReport {
  commonMistakes: string[];
  learningTips: string[];
  generatedAt: number;
}

export enum ActionType {
  // Original
  SIMPLIFY = 'simplify',
  NOTES = 'notes',
  QUIZ = 'quiz',
  EXPLAIN = 'explain',
  
  // New Smart Actions
  ELI5 = 'eli5',           // Explain Like I'm 5
  DIAGRAM = 'diagram',     // Visual/ASCII Diagram
  MNEMONIC = 'mnemonic',   // Memory Trick
  REVISION = 'revision',   // 1-Minute Revision
  PRACTICE = 'practice'    // Practice Questions
}

export enum AppMode {
  UPLOAD = 'upload',
  CHAT = 'chat',
  DASHBOARD = 'dashboard',
  HISTORY = 'history'
}

// Speech Recognition Types (Kept same)
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

export interface AppState {
  messages: ChatMessage[];
  chatHistory: ChatSession[];
  currentSessionId: string | null;
  isLoading: boolean;
  currentMode: AppMode;
  error: string | null;
  userProfile: UserProfile;
  isProfileOpen: boolean;
  youtubeLink: string;
  isListening: boolean;
  isOfflineMode: boolean; // NEW: Tracks if we are using the fallback engine
}

export type AppAction =
  | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_MODE'; payload: AppMode }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'UPDATE_PROFILE'; payload: Partial<UserProfile> }
  | { type: 'TOGGLE_PROFILE'; payload: boolean }
  | { type: 'SET_YOUTUBE_LINK'; payload: string }
  | { type: 'SET_LISTENING'; payload: boolean }
  | { type: 'RESET_APP' }
  | { type: 'SET_OFFLINE_MODE'; payload: boolean }
  | { type: 'UPDATE_MESSAGE_AUDIO'; payload: { id: string; isPlaying: boolean } }
  | { type: 'LOAD_SESSION'; payload: ChatSession }
  | { type: 'DELETE_SESSION'; payload: string }
  | { type: 'CLEAR_HISTORY' };
