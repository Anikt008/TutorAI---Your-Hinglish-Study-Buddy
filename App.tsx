import React, { useEffect, useRef, useReducer, useState } from 'react';
import { Sender, ChatMessage, ActionType, UserProfile, ProgressReport, AppState, AppAction, SpeechRecognitionEvent, SpeechRecognitionErrorEvent, AppMode, SpeechRecognition, ChatSession } from './types';
import UploadZone from './components/UploadZone';
import MarkdownRenderer from './components/MarkdownRenderer';
import Sidebar from './components/Sidebar';
import SmartActions from './components/SmartActions';
import ProfileModal from './components/ProfileModal'; // Can act as Dashboard detail view
import HistoryView from './components/HistoryView';
import { startNewSession, analyzeYouTubeVideo, sendFollowUp, generateSpeech, getOfflineResponse } from './services/geminiService';
import { playAudioStream } from './services/audioUtils';

const initialState: AppState = {
  messages: [],
  chatHistory: [],
  currentSessionId: null,
  isLoading: false,
  currentMode: AppMode.UPLOAD,
  error: null,
  userProfile: { name: 'Student', weakTopics: [], strongTopics: [], totalSessions: 0, streakDays: 1, lastStudyDate: new Date().toISOString() },
  isProfileOpen: false,
  youtubeLink: '',
  isListening: false,
  isOfflineMode: false,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MESSAGES': 
      return { ...state, messages: action.payload };
    
    case 'ADD_MESSAGE': {
      const newMessages = [...state.messages, action.payload];
      let sessionId = state.currentSessionId;
      let sessionTitle = "New Chat";
      const timestamp = Date.now();

      // If no session exists, create one
      if (!sessionId) {
        sessionId = timestamp.toString();
        // Determine title from first user message
        const firstUserMsg = newMessages.find(m => m.role === Sender.User);
        if (firstUserMsg) {
           sessionTitle = firstUserMsg.image ? "Image Question" : (firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? "..." : ""));
        }
      } else {
        // Retrieve existing title
        const existingSession = state.chatHistory.find(s => s.id === sessionId);
        if (existingSession) sessionTitle = existingSession.title;
      }

      // Update History
      const updatedHistory = [
        // Remove current session from history to re-add it at the top (or update it)
        ...state.chatHistory.filter(s => s.id !== sessionId),
        {
          id: sessionId,
          title: sessionTitle,
          timestamp: timestamp,
          messages: newMessages
        }
      ];

      return { 
        ...state, 
        messages: newMessages,
        currentSessionId: sessionId,
        chatHistory: updatedHistory
      };
    }
    
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_MODE': return { ...state, currentMode: action.payload };
    case 'SET_ERROR': return { ...state, error: action.payload };
    case 'UPDATE_PROFILE': return { ...state, userProfile: { ...state.userProfile, ...action.payload } };
    case 'TOGGLE_PROFILE': return { ...state, isProfileOpen: action.payload };
    case 'SET_YOUTUBE_LINK': return { ...state, youtubeLink: action.payload };
    case 'SET_LISTENING': return { ...state, isListening: action.payload };
    case 'SET_OFFLINE_MODE': return { ...state, isOfflineMode: action.payload };
    
    case 'UPDATE_MESSAGE_AUDIO': 
      return { 
        ...state, 
        messages: state.messages.map(m => m.id === action.payload.id ? { ...m, isAudioPlaying: action.payload.isPlaying } : m)
      };
    
    case 'RESET_APP': 
      return { 
        ...state, 
        messages: [],
        currentSessionId: null, // Reset session ID for a new chat
        currentMode: AppMode.UPLOAD 
      };

    case 'LOAD_SESSION':
      return {
        ...state,
        messages: action.payload.messages,
        currentSessionId: action.payload.id,
        currentMode: AppMode.CHAT
      };

    case 'DELETE_SESSION':
      return {
        ...state,
        chatHistory: state.chatHistory.filter(s => s.id !== action.payload),
        // If deleting current session, reset view
        ...(state.currentSessionId === action.payload ? { messages: [], currentSessionId: null, currentMode: AppMode.UPLOAD } : {})
      };

    case 'CLEAR_HISTORY':
      return { ...state, chatHistory: [] };

    default: return state;
  }
}

const App: React.FC = () => {
  const loadInitialState = (): { profile: UserProfile, history: ChatSession[] } => {
    try {
      const savedProfile = localStorage.getItem('tutorAiProfile');
      const savedHistory = localStorage.getItem('tutorAiHistory');
      return {
        profile: savedProfile ? JSON.parse(savedProfile) : initialState.userProfile,
        history: savedHistory ? JSON.parse(savedHistory) : []
      };
    } catch (e) {
      return { profile: initialState.userProfile, history: [] };
    }
  };

  const initData = loadInitialState();

  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    userProfile: initData.profile,
    chatHistory: initData.history
  });

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [currentTopic, setCurrentTopic] = React.useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Dark Mode Logic
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    try {
      const saved = localStorage.getItem('tutorAiTheme');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  // Persist Profile
  useEffect(() => {
    localStorage.setItem('tutorAiProfile', JSON.stringify(state.userProfile));
  }, [state.userProfile]);

  // Persist History
  useEffect(() => {
    localStorage.setItem('tutorAiHistory', JSON.stringify(state.chatHistory));
  }, [state.chatHistory]);

  // Sync Dark Mode class
  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('tutorAiTheme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('tutorAiTheme', 'light');
    }
  }, [isDarkMode]);

  const processResponse = (rawText: string): string => {
    const topicMatch = rawText.match(/\[\[TOPIC:\s*(.*?)\]\]/);
    if (topicMatch && topicMatch[1]) {
      const topic = topicMatch[1].trim();
      setCurrentTopic(topic);
      // Update streak/stats if it's a new session
      const today = new Date().toISOString().split('T')[0];
      const last = state.userProfile.lastStudyDate.split('T')[0];
      if (today !== last) {
        dispatch({ type: 'UPDATE_PROFILE', payload: { streakDays: state.userProfile.streakDays + 1, lastStudyDate: new Date().toISOString() } });
      }
      return rawText.replace(/\[\[TOPIC:.*?\]\]/, '').trim();
    }
    return rawText;
  };

  const handleSpeak = async (msg: ChatMessage) => {
    if (msg.role !== Sender.Bot) return;

    if (msg.isAudioPlaying) {
        // Toggle off (Logic implies we want to stop. playAudioStream handles singleton replacement, but explicit stop isn't exposed yet, 
        // effectively playing a new stream or letting it finish. For now, we update UI state).
        dispatch({ type: 'UPDATE_MESSAGE_AUDIO', payload: { id: msg.id, isPlaying: false } });
        // In a full implementation, we would call audioContext.suspend() or source.stop() exposed via utils
        return;
    }

    dispatch({ type: 'UPDATE_MESSAGE_AUDIO', payload: { id: msg.id, isPlaying: true } });
    try {
      // 1. Generate Audio (or fetch if cached)
      const audioData = await generateSpeech(msg.text);
      // 2. Play Audio
      await playAudioStream(audioData);
    } catch (e) {
      console.error("Audio playback failed", e);
      alert("Could not play audio. Check internet connection.");
    } finally {
      dispatch({ type: 'UPDATE_MESSAGE_AUDIO', payload: { id: msg.id, isPlaying: false } });
    }
  };

  const handleQuickStart = async (topic: string) => {
    // Reset session for new quick start if we are not already in a chat
    if (state.currentMode !== AppMode.CHAT) {
      dispatch({ type: 'RESET_APP' });
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: Sender.User, text: `Explain: ${topic}` };
    dispatch({ type: 'ADD_MESSAGE', payload: userMsg });

    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await startNewSession(null, null, state.userProfile, `Explain ${topic} in simple Hinglish.`);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
      dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
    } catch (error) {
      console.warn("API Failed, switching to Offline Mode", error);
      dispatch({ type: 'SET_OFFLINE_MODE', payload: true });
      const mock = getOfflineResponse(topic, ActionType.EXPLAIN);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: mock } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleImageSelect = async (file: File) => {
    dispatch({ type: 'RESET_APP' });
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      const userMsg: ChatMessage = { id: Date.now().toString(), role: Sender.User, text: "Can you explain this question?", image: base64String };
      dispatch({ type: 'ADD_MESSAGE', payload: userMsg });

      try {
        if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
        const rawResponse = await startNewSession(base64Data, mimeType, state.userProfile);
        const cleanText = processResponse(rawResponse);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
        dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
      } catch (error) {
         console.warn("API Failed, switching to Offline Mode", error);
         dispatch({ type: 'SET_OFFLINE_MODE', payload: true });
         dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "📷 **Offline Mode**: I can't analyze images without internet, but tell me the topic and I'll explain!" } });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAction = async (action: ActionType | string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    // Add User Action Bubble if it is a text input, if it is an enum (ActionType), format it.
    let displayUserText = "";
    
    // Check if the action passed is one of the ActionType enum values.
    // ActionType is a string enum, so we can check inclusion in its values.
    const isActionEnum = Object.values(ActionType).includes(action as ActionType);

    if (isActionEnum) {
        displayUserText = `Apply: ${(action as string).toUpperCase().replace('_', ' ')}`;
    } else {
        displayUserText = action as string;
    }
    
    // Check if the last message was the same user text to avoid double bubbles (handled in onKeyDown already)
    const lastMsg = state.messages[state.messages.length - 1];
    if (!lastMsg || lastMsg.role !== Sender.User || lastMsg.text !== displayUserText) {
       dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: displayUserText } });
    }

    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await sendFollowUp(action);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
    } catch (error) {
       console.warn("API Failed, switching to Offline Mode", error);
       dispatch({ type: 'SET_OFFLINE_MODE', payload: true });
       
       const userQuery = typeof action === 'string' ? action : "";
       const actionType = typeof action !== 'string' ? action : undefined;
       
       const mock = getOfflineResponse(userQuery, actionType);
       dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: mock } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleVideoAnalysis = async () => {
    const trimmedLink = state.youtubeLink.trim();
    if (!trimmedLink) return;

    dispatch({ type: 'RESET_APP' });
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });
    
    dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: `Video: ${trimmedLink}` } });
    
    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await analyzeYouTubeVideo(trimmedLink, state.userProfile);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: processResponse(rawResponse) } });
    } catch (error) {
       console.warn("API Failed, switching to Offline Mode", error);
       dispatch({ type: 'SET_OFFLINE_MODE', payload: true });
       // Use getMockResponse to simulate video analysis even offline/failed state
       const mock = getOfflineResponse(trimmedLink);
       dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: mock } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleVoiceInput = () => {
    if (state.isListening) {
      recognitionRef.current?.stop();
      dispatch({ type: 'SET_LISTENING', payload: false });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input. Try using Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    // Setting to 'en-IN' for Hinglish support (Indian English often captures mixed phrases better than 'hi-IN' which might enforce Devanagari)
    recognition.lang = 'en-IN'; 
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      dispatch({ type: 'SET_LISTENING', payload: true });
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => (prev ? prev + ' ' : '') + transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech Recognition Error:", event.error);
      dispatch({ type: 'SET_LISTENING', payload: false });
    };

    recognition.onend = () => {
      dispatch({ type: 'SET_LISTENING', payload: false });
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleCloseProfile = () => {
    // Safely determine next mode: Chat if messages exist, otherwise Home
    // Ensure state.messages is checked for validity
    const hasMessages = state.messages && Array.isArray(state.messages) && state.messages.length > 0;
    const nextMode = hasMessages ? AppMode.CHAT : AppMode.UPLOAD;
    dispatch({ type: 'SET_MODE', payload: nextMode });
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200 overflow-hidden relative">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentMode={state.currentMode} 
        onNavigate={(mode) => dispatch({ type: 'SET_MODE', payload: mode })} 
        profile={state.userProfile}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onNewChat={() => dispatch({ type: 'RESET_APP' })}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Mobile Header */}
        <header className="md:hidden h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 dark:text-white">☰</button>
          <span className="font-bold text-lg dark:text-white">TutorAI</span>
          <div className="w-8"></div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide p-4 max-w-4xl mx-auto w-full">
          
          {state.currentMode === AppMode.UPLOAD && (
            <div className="flex flex-col items-center justify-center min-h-[80vh] animate-fade-in">
              <div className="text-center mb-8">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wide mb-2 inline-block">Vibe Code Ready</span>
                <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight leading-tight">
                  Master Any Subject <br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-purple-600">In Hinglish</span>
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
                  AI Tutor that explains like a friend. Upload homework, paste links, or just ask.
                </p>
              </div>
              
              <UploadZone onFileSelect={handleImageSelect} />
              
              {/* Quick Start Chips */}
              <div className="flex gap-2 mt-8 flex-wrap justify-center">
                {["🚀 Newton's Laws", "🌿 Photosynthesis", "∫ Calculus", "🇮🇳 Indian History", "🧬 DNA Structure", "💰 Balance Sheet"].map(topic => (
                  <button key={topic} onClick={() => handleQuickStart(topic)} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-sm font-medium hover:border-indigo-500 hover:scale-105 transition-all shadow-sm dark:text-slate-200">
                    {topic}
                  </button>
                ))}
              </div>

              {/* Video Input */}
              <div className="w-full max-w-md mt-8 relative">
                <input
                  type="text"
                  placeholder="Paste YouTube Link..."
                  className="w-full pl-4 pr-24 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl focus:border-indigo-500 outline-none transition-colors dark:text-white"
                  value={state.youtubeLink}
                  onChange={(e) => dispatch({ type: 'SET_YOUTUBE_LINK', payload: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleVideoAnalysis()}
                />
                <button onClick={handleVideoAnalysis} className="absolute right-2 top-2 bottom-2 bg-indigo-600 text-white px-4 rounded-lg text-sm font-bold hover:bg-indigo-700">Go</button>
              </div>
            </div>
          )}

          {state.currentMode === AppMode.HISTORY && (
            <HistoryView 
              sessions={state.chatHistory}
              onSelect={(session) => dispatch({ type: 'LOAD_SESSION', payload: session })}
              onDelete={(id) => dispatch({ type: 'DELETE_SESSION', payload: id })}
              onClear={() => {
                if(window.confirm("Are you sure you want to clear all history?")) {
                  dispatch({ type: 'CLEAR_HISTORY' });
                }
              }}
            />
          )}

          {state.currentMode === AppMode.CHAT && (
            <div className="flex flex-col space-y-6 pb-32">
              {state.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === Sender.User ? 'justify-end' : 'justify-start'}`}>
                  <div className={`relative max-w-[90%] md:max-w-[80%] rounded-2xl shadow-sm overflow-hidden ${
                    msg.role === Sender.User 
                      ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                  }`}>
                    {msg.image && <img src={msg.image} className="w-full max-h-60 object-cover" alt="User upload" />}
                    <div className="p-5">
                      {msg.role === Sender.User ? (
                        <p className="font-medium text-lg leading-relaxed">{msg.text}</p>
                      ) : (
                        <div className="relative">
                          <MarkdownRenderer content={msg.text} />
                          {/* Speaker Button - Only for Bot */}
                          <div className="flex justify-end mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                            <button 
                              onClick={() => handleSpeak(msg)}
                              className={`p-2 rounded-full transition-all flex items-center gap-2 text-sm ${
                                msg.isAudioPlaying 
                                ? 'bg-indigo-100 text-indigo-600 animate-pulse dark:bg-indigo-900/40 dark:text-indigo-300' 
                                : 'text-slate-400 hover:bg-slate-50 hover:text-indigo-600 dark:hover:bg-slate-700/50 dark:hover:text-indigo-400'
                              }`}
                              title="Listen to explanation"
                            >
                               {msg.isAudioPlaying ? (
                                 <>
                                   <span className="animate-bounce">🔈</span>
                                   <span>Playing...</span>
                                 </>
                               ) : (
                                 <>
                                   <span>🔈</span>
                                   <span>Listen</span>
                                 </>
                               )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {state.isLoading && (
                 <div className="flex justify-start">
                   <div className="bg-white dark:bg-slate-800 px-6 py-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                     <div className="flex space-x-1">
                       <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                       <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-75"></div>
                       <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce delay-150"></div>
                     </div>
                     <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Thinking...</span>
                   </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </main>

        {/* Chat Footer */}
        {state.currentMode === AppMode.CHAT && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800 p-4">
             <div className="max-w-4xl mx-auto space-y-3">
               {!state.isLoading && <SmartActions onAction={handleAction} disabled={state.isLoading} />}
               
               <div className="flex gap-2 relative">
                 <input 
                    type="text" 
                    placeholder={state.isListening ? "Listening..." : "Ask a follow-up..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className={`flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-full px-5 py-3 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white shadow-inner transition-all ${state.isListening ? 'animate-pulse ring-2 ring-indigo-300' : ''}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (inputText.trim()) {
                           const txt = inputText;
                           setInputText('');
                           // Pass text directly to handleAction, don't duplicate dispatch here
                           handleAction(txt); 
                        }
                      }
                    }}
                 />
                 {/* Voice Button */}
                 <button 
                   onClick={handleVoiceInput}
                   className={`p-3 rounded-full transition-all duration-200 ${
                     state.isListening 
                     ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400' 
                     : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50'
                   }`}
                   title="Voice Input"
                 >
                   {state.isListening ? '⏹️' : '🎤'}
                 </button>
               </div>
             </div>
          </div>
        )}
      </div>

      {/* Render ProfileModal at root level for proper z-index and event handling */}
      {state.currentMode === AppMode.DASHBOARD && (
        <ProfileModal 
          isOpen={true}
          onClose={handleCloseProfile}
          profile={state.userProfile}
          history={state.messages || []} // Default to empty array to prevent crashes
          onSaveReport={(r) => dispatch({ type: 'UPDATE_PROFILE', payload: { progressReport: r } })}
        />
      )}
    </div>
  );
};

export default App;