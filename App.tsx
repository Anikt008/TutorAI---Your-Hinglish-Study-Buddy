
import React, { useEffect, useRef, useReducer } from 'react';
import { Sender, ChatMessage, ActionType, UserProfile, ProgressReport, AppState, AppAction, SpeechRecognitionEvent, SpeechRecognitionErrorEvent, AppMode } from './types';
import UploadZone from './components/UploadZone';
import MarkdownRenderer from './components/MarkdownRenderer';
import Sidebar from './components/Sidebar';
import SmartActions from './components/SmartActions';
import ProfileModal from './components/ProfileModal'; // Can act as Dashboard detail view
import { startNewSession, analyzeYouTubeVideo, sendFollowUp, generateSpeech, getOfflineResponse } from './services/geminiService';
import { playAudioStream } from './services/audioUtils';

const initialState: AppState = {
  messages: [],
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
    case 'SET_MESSAGES': return { ...state, messages: action.payload };
    case 'ADD_MESSAGE': return { ...state, messages: [...state.messages, action.payload] };
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
    case 'RESET_APP': return { ...initialState, userProfile: state.userProfile, currentMode: AppMode.UPLOAD };
    default: return state;
  }
}

const App: React.FC = () => {
  const loadInitialProfile = (): UserProfile => {
    try {
      const saved = localStorage.getItem('tutorAiProfile');
      return saved ? JSON.parse(saved) : initialState.userProfile;
    } catch (e) {
      return initialState.userProfile;
    }
  };

  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    userProfile: loadInitialProfile()
  });

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [currentTopic, setCurrentTopic] = React.useState<string | null>(null);
  
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

  useEffect(() => {
    localStorage.setItem('tutorAiProfile', JSON.stringify(state.userProfile));
  }, [state.userProfile]);

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

  // Handle Offline Mode Fallback
  const handleOfflineError = (error: any) => {
    if (error.message === "OFFLINE_MODE" || error.message === "MISSING_KEY") {
      if (!state.isOfflineMode) {
        dispatch({ type: 'SET_OFFLINE_MODE', payload: true });
        dispatch({ type: 'ADD_MESSAGE', payload: { 
          id: Date.now().toString(), 
          role: Sender.Bot, 
          text: "⚠️ **Offline Mode Activated**\nInternet or API Key is missing. I will try my best to help you with limited knowledge!",
          type: 'error'
        }});
      }
      return true;
    }
    return false;
  };

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

  const handleQuickStart = async (topic: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: Sender.User, text: `Explain: ${topic}` };
    dispatch({ type: 'SET_MESSAGES', payload: [userMsg] });

    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await startNewSession(null, null, state.userProfile, `Explain ${topic} in simple Hinglish.`);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
      dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
    } catch (error) {
      if (handleOfflineError(error)) {
        const mock = getOfflineResponse(topic, ActionType.EXPLAIN);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: mock } });
      } else {
        dispatch({ type: 'SET_ERROR', payload: "Could not start session." });
      }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleImageSelect = async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      const userMsg: ChatMessage = { id: Date.now().toString(), role: Sender.User, text: "Can you explain this question?", image: base64String };
      dispatch({ type: 'SET_MESSAGES', payload: [userMsg] });

      try {
        if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
        const rawResponse = await startNewSession(base64Data, mimeType, state.userProfile);
        const cleanText = processResponse(rawResponse);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
        dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
      } catch (error) {
         if (handleOfflineError(error)) {
           dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "📷 **Offline Mode**: I can't analyze images without internet, but tell me the topic and I'll explain!" } });
         } else {
           dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "Error analyzing image." } });
         }
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAction = async (action: ActionType) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    // Add User Action Bubble
    const actionLabel = action.toUpperCase().replace('_', ' ');
    dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: `Apply: ${actionLabel}` } });

    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await sendFollowUp(action);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
    } catch (error) {
       if (handleOfflineError(error)) {
          const mock = getOfflineResponse("", action);
          dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: mock } });
       }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleVideoAnalysis = async () => {
    const trimmedLink = state.youtubeLink.trim();
    if (!trimmedLink) return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: AppMode.CHAT });
    dispatch({ type: 'SET_MESSAGES', payload: [{ id: Date.now().toString(), role: Sender.User, text: `Video: ${trimmedLink}` }] });
    
    try {
      if (state.isOfflineMode) throw new Error("OFFLINE_MODE");
      const rawResponse = await analyzeYouTubeVideo(trimmedLink, state.userProfile);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: processResponse(rawResponse) } });
    } catch (error) {
       if(handleOfflineError(error)) {
         dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "📺 **Offline**: Can't watch videos. Type the topic!" } });
       }
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-200 overflow-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentMode={state.currentMode} 
        onNavigate={(mode) => dispatch({ type: 'SET_MODE', payload: mode })} 
        profile={state.userProfile}
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
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
                {["🚀 Newton's Laws", "∫ Calculus", "🇮🇳 Indian History", "🧬 DNA Structure"].map(topic => (
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

          {state.currentMode === AppMode.CHAT && (
            <div className="flex flex-col space-y-6 pb-32">
              {state.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === Sender.User ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] md:max-w-[80%] rounded-2xl shadow-sm overflow-hidden ${
                    msg.role === Sender.User 
                      ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                  }`}>
                    {msg.image && <img src={msg.image} className="w-full max-h-60 object-cover" alt="User upload" />}
                    <div className="p-5">
                      {msg.role === Sender.User ? (
                        <p className="font-medium text-lg leading-relaxed">{msg.text}</p>
                      ) : (
                        <MarkdownRenderer content={msg.text} />
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

          {state.currentMode === AppMode.DASHBOARD && (
             <div className="py-8 animate-fade-in">
                <ProfileModal 
                  isOpen={true} // Always open in dashboard mode
                  onClose={() => {}} // No close button in dashboard mode
                  profile={state.userProfile}
                  history={state.messages}
                  onSaveReport={(r) => dispatch({ type: 'UPDATE_PROFILE', payload: { progressReport: r } })}
                />
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
                    placeholder="Ask a follow-up..."
                    className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-full px-5 py-3 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white shadow-inner"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        if (target.value.trim()) {
                           const txt = target.value;
                           target.value = '';
                           dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: txt } });
                           handleAction(txt as any); // Treat text as custom action
                        }
                      }
                    }}
                 />
                 {/* Voice Button */}
                 <button className="p-3 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors">🎤</button>
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
