import React, { useEffect, useRef, useReducer } from 'react';
import { Sender, ChatMessage, ActionType, UserProfile, ProgressReport, AppState, AppAction } from './types';
import UploadZone from './components/UploadZone';
import MarkdownRenderer from './components/MarkdownRenderer';
import Button from './components/Button';
import ProfileModal from './components/ProfileModal';
import { startNewSession, analyzeYouTubeVideo, sendFollowUp, generateSpeech } from './services/geminiService';
import { playAudioStream } from './services/audioUtils';

// Reducer for robust state management
const initialState: AppState = {
  messages: [],
  isLoading: false,
  currentMode: 'upload',
  error: null,
  userProfile: { weakTopics: [], strongTopics: [], totalSessions: 0 },
  isProfileOpen: false,
  youtubeLink: '',
  isListening: false,
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
    case 'UPDATE_MESSAGE_AUDIO': 
      return { 
        ...state, 
        messages: state.messages.map(m => m.id === action.payload.id ? { ...m, isAudioPlaying: action.payload.isPlaying } : m)
      };
    case 'RESET_APP': return { ...initialState, userProfile: state.userProfile };
    default: return state;
  }
}

const App: React.FC = () => {
  // Load profile lazily to avoid reducer side-effects
  const loadInitialProfile = (): UserProfile => {
    try {
      const saved = localStorage.getItem('tutorAiProfile');
      return saved ? JSON.parse(saved) : { weakTopics: [], strongTopics: [], totalSessions: 0 };
    } catch (e) {
      return { weakTopics: [], strongTopics: [], totalSessions: 0 };
    }
  };

  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    userProfile: loadInitialProfile()
  });

  const [currentTopic, setCurrentTopic] = React.useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState(() => 
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Effects ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('tutorAiProfile', JSON.stringify(state.userProfile));
  }, [state.userProfile]);

  // --- Helpers ---
  const processResponse = (rawText: string): string => {
    const topicMatch = rawText.match(/\[\[TOPIC:\s*(.*?)\]\]/);
    if (topicMatch && topicMatch[1]) {
      setCurrentTopic(topicMatch[1].trim());
      return rawText.replace(/\[\[TOPIC:.*?\]\]/, '').trim();
    }
    return rawText;
  };

  const updateProfileTopics = (type: 'weak' | 'strong') => {
    if (!currentTopic) return;
    
    const { weakTopics, strongTopics } = state.userProfile;
    let newWeak = [...weakTopics];
    let newStrong = [...strongTopics];

    if (type === 'weak') {
      if (!weakTopics.includes(currentTopic)) newWeak.push(currentTopic);
      newStrong = newStrong.filter(t => t !== currentTopic);
    } else {
      if (!strongTopics.includes(currentTopic)) newStrong.push(currentTopic);
      newWeak = newWeak.filter(t => t !== currentTopic);
    }

    dispatch({ type: 'UPDATE_PROFILE', payload: { weakTopics: newWeak, strongTopics: newStrong } });
  };

  // --- Handlers ---
  const handleImageSelect = async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: 'chat' });

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type || 'image/jpeg';

      const userMsg: ChatMessage = { id: Date.now().toString(), role: Sender.User, text: "Can you explain this question?", image: base64String };
      dispatch({ type: 'SET_MESSAGES', payload: [userMsg] });

      try {
        const rawResponse = await startNewSession(base64Data, mimeType, state.userProfile);
        const cleanText = processResponse(rawResponse);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
        dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
      } catch (error) {
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "Error analyzing image. Please try again." } });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoAnalysis = async () => {
    const trimmedLink = state.youtubeLink.trim();
    if (!trimmedLink || !trimmedLink.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/)) {
      alert("Please enter a valid YouTube URL.");
      return;
    }

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_MODE', payload: 'chat' });
    dispatch({ type: 'SET_MESSAGES', payload: [{ id: Date.now().toString(), role: Sender.User, text: `Analyze this video: ${trimmedLink}` }] });
    
    try {
      const rawResponse = await analyzeYouTubeVideo(trimmedLink, state.userProfile);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
      dispatch({ type: 'UPDATE_PROFILE', payload: { totalSessions: state.userProfile.totalSessions + 1 } });
    } catch (error) {
      dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "Could not analyze video. Ensure it is public." } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      dispatch({ type: 'SET_YOUTUBE_LINK', payload: '' });
    }
  };

  const handleAction = async (action: ActionType) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    if (action === ActionType.SIMPLIFY) updateProfileTopics('weak');

    try {
      const rawResponse = await sendFollowUp(action);
      const cleanText = processResponse(rawResponse);
      dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.Bot, text: cleanText } });
    } catch (error) {
       dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.Bot, text: "Session expired or error. Please restart." } });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  };

  const handleSpeak = async (text: string, msgId: string) => {
    dispatch({ type: 'UPDATE_MESSAGE_AUDIO', payload: { id: msgId, isPlaying: true } });
    try {
      await playAudioStream(await generateSpeech(text));
    } catch (e) {
      console.error("Audio failed", e);
    } finally {
      dispatch({ type: 'UPDATE_MESSAGE_AUDIO', payload: { id: msgId, isPlaying: false } });
    }
  };

  // --- Voice Input Logic ---
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser does not support voice input.");
      return;
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Indian English
    recognition.continuous = false;
    recognition.interimResults = false;

    dispatch({ type: 'SET_LISTENING', payload: true });

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      dispatch({ type: 'SET_LISTENING', payload: false });
      
      // Send the transcript as a follow-up
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: transcript } });
      
      try {
        const rawResponse = await sendFollowUp(transcript);
        const cleanText = processResponse(rawResponse);
        dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: cleanText } });
      } catch (e) {
         dispatch({ type: 'ADD_MESSAGE', payload: { id: (Date.now() + 1).toString(), role: Sender.Bot, text: "Could not process voice command." } });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    recognition.onerror = () => {
      dispatch({ type: 'SET_LISTENING', payload: false });
      alert("Voice recognition failed. Please try again.");
    };

    recognition.start();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors duration-200">
      <ProfileModal 
        isOpen={state.isProfileOpen} 
        onClose={() => dispatch({ type: 'TOGGLE_PROFILE', payload: false })} 
        profile={state.userProfile}
        history={state.messages}
        onSaveReport={(report) => dispatch({ type: 'UPDATE_PROFILE', payload: { progressReport: report } })}
      />

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => dispatch({ type: 'RESET_APP' })}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-xl text-slate-800 dark:text-white">TutorAI</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_PROFILE', payload: true })}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300 flex items-center space-x-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {state.userProfile.totalSessions > 0 && <span className="text-xs font-bold">{state.userProfile.totalSessions}</span>}
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              {isDarkMode ? '🌙' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-4">
        {state.currentMode === 'upload' ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in py-8">
            <div className="text-center mb-8 max-w-lg">
              <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
                Your Personal <span className="text-indigo-600 dark:text-indigo-400">AI Tutor</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                Powered by Gemini 3 Pro. Upload homework, paste YouTube links, or just talk.
              </p>
            </div>
            
            <UploadZone onFileSelect={handleImageSelect} />

            <div className="w-full max-w-md mx-auto mt-6">
              <div className="flex items-center w-full mb-6">
                <div className="flex-grow h-px bg-slate-200 dark:bg-slate-700"></div>
                <span className="px-4 text-slate-400 dark:text-slate-500 text-sm font-medium">OR PASTE VIDEO LINK</span>
                <div className="flex-grow h-px bg-slate-200 dark:bg-slate-700"></div>
              </div>
              
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Paste YouTube Link..."
                  className="w-full pl-4 pr-32 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-indigo-500 transition-all text-slate-700 dark:text-white"
                  value={state.youtubeLink}
                  onChange={(e) => dispatch({ type: 'SET_YOUTUBE_LINK', payload: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && handleVideoAnalysis()}
                />
                <button
                  onClick={handleVideoAnalysis}
                  disabled={!state.youtubeLink}
                  className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl font-medium disabled:opacity-50"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 pb-24">
            {state.messages.map((msg, idx) => (
              <div key={msg.id} className={`flex ${msg.role === Sender.User ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl overflow-hidden shadow-sm ${msg.role === Sender.User ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`}>
                  {msg.image && (
                    <div className="bg-slate-900"><img src={msg.image} alt="Uploaded query" className="w-full max-h-64 object-contain" /></div>
                  )}
                  <div className="p-4 md:p-6">
                    {msg.role === Sender.User ? <p className="font-medium break-words">{msg.text}</p> : (
                      <>
                        <MarkdownRenderer content={msg.text} />
                        {idx === state.messages.length - 1 && !state.isLoading && (
                          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
                             <Button variant="secondary" onClick={() => handleAction(ActionType.SIMPLIFY)}>Samajh Nahi Aaya 🤯</Button>
                            <Button variant="primary" className="!bg-green-600" onClick={() => updateProfileTopics('strong')}>Got it! 🌟</Button>
                            <Button variant="outline" onClick={() => handleAction(ActionType.NOTES)}>Notes 📝</Button>
                             <Button variant="outline" onClick={() => handleAction(ActionType.QUIZ)}>Quiz 🧠</Button>
                             <Button variant="outline" disabled={msg.isAudioPlaying} onClick={() => handleSpeak(msg.text, msg.id)}>
                              {msg.isAudioPlaying ? 'Playing...' : '🔊 Listen'}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {state.isLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-4">
                  <span className="text-sm text-slate-500 font-medium">TutorAI is thinking (Gemini 3 Pro)...</span>
                </div>
              </div>
            )}
            
            {/* Input Bar for Follow-up */}
            {!state.isLoading && (
              <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-t border-slate-200 dark:border-slate-800">
                <div className="max-w-3xl mx-auto flex gap-2">
                   <button 
                    onClick={startListening}
                    className={`p-3 rounded-full transition-colors ${state.isListening ? 'bg-red-500 animate-pulse text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
                  >
                    🎤
                  </button>
                  <input 
                    type="text" 
                    placeholder="Ask a follow-up question..."
                    className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-full px-4 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement;
                        if (target.value.trim()) {
                           const txt = target.value;
                           target.value = '';
                           dispatch({ type: 'SET_LOADING', payload: true });
                           dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.User, text: txt } });
                           sendFollowUp(txt).then(res => {
                             dispatch({ type: 'ADD_MESSAGE', payload: { id: Date.now().toString(), role: Sender.Bot, text: processResponse(res) } });
                           }).finally(() => dispatch({ type: 'SET_LOADING', payload: false }));
                        }
                      }
                    }}
                  />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
