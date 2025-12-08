import React, { useState, useEffect, useRef } from 'react';
import { Sender, ChatMessage, ActionType, UserProfile, ProgressReport } from './types';
import UploadZone from './components/UploadZone';
import MarkdownRenderer from './components/MarkdownRenderer';
import Button from './components/Button';
import ProfileModal from './components/ProfileModal';
import { startNewSession, analyzeYouTubeVideo, sendFollowUp, generateSpeech } from './services/geminiService';
import { playAudioStream } from './services/audioUtils';

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMode, setCurrentMode] = useState<'upload' | 'chat'>('upload');
  const [youtubeLink, setYoutubeLink] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => 
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  
  // Profile State with robust loading
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem('tutorAiProfile');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          weakTopics: [],
          strongTopics: [],
          totalSessions: 0,
          progressReport: undefined,
          ...parsed
        };
      }
    } catch (e) {
      console.error("Failed to load profile", e);
    }
    return { weakTopics: [], strongTopics: [], totalSessions: 0 };
  });

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentTopic, setCurrentTopic] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('tutorAiProfile', JSON.stringify(userProfile));
  }, [userProfile]);

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
    
    setUserProfile(prev => {
      const isWeak = prev.weakTopics.includes(currentTopic);
      const isStrong = prev.strongTopics.includes(currentTopic);
      
      let newWeak = [...prev.weakTopics];
      let newStrong = [...prev.strongTopics];

      if (type === 'weak') {
        if (!isWeak) newWeak.push(currentTopic);
        if (isStrong) newStrong = newStrong.filter(t => t !== currentTopic);
      } else {
        if (!isStrong) newStrong.push(currentTopic);
        if (isWeak) newWeak = newWeak.filter(t => t !== currentTopic);
      }

      return { ...prev, weakTopics: newWeak, strongTopics: newStrong };
    });
  };

  const handleSaveReport = (report: ProgressReport) => {
    setUserProfile(prev => ({ ...prev, progressReport: report }));
  };

  const handleImageSelect = async (file: File) => {
    setIsLoading(true);
    setCurrentMode('chat');

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      const mimeType = file.type || 'image/jpeg'; // Default to jpeg if empty

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: Sender.User,
        text: "Can you explain this question?",
        image: base64String
      };
      setMessages([userMsg]);

      try {
        const rawResponse = await startNewSession(base64Data, mimeType, userProfile);
        const cleanText = processResponse(rawResponse);
        
        const botMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: Sender.Bot,
          text: cleanText
        };
        setMessages(prev => [...prev, botMsg]);
        setUserProfile(p => ({ ...p, totalSessions: p.totalSessions + 1 }));
      } catch (error) {
        console.error(error);
        const errorMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: Sender.Bot,
          text: "Sorry, I encountered an error analyzing the image. Please try again."
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoAnalysis = async () => {
    const trimmedLink = youtubeLink.trim();
    if (!trimmedLink) return;
    
    if (!trimmedLink.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/)) {
      alert("Please enter a valid YouTube URL.");
      return;
    }

    setIsLoading(true);
    setCurrentMode('chat');
    
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: Sender.User,
      text: `Analyze this video: ${trimmedLink}`
    };
    setMessages([userMsg]);
    
    try {
      const rawResponse = await analyzeYouTubeVideo(trimmedLink, userProfile);
      const cleanText = processResponse(rawResponse);
      
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: Sender.Bot,
        text: cleanText
      };
      setMessages(prev => [...prev, botMsg]);
      setUserProfile(p => ({ ...p, totalSessions: p.totalSessions + 1 }));
    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: Sender.Bot,
        text: "Sorry, I couldn't analyze that video link. Please make sure the video is public."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setYoutubeLink('');
    }
  };

  const handleAction = async (action: ActionType) => {
    setIsLoading(true);
    
    if (action === ActionType.SIMPLIFY) {
      updateProfileTopics('weak');
    }

    try {
      const rawResponse = await sendFollowUp(action);
      const cleanText = processResponse(rawResponse);
      
      const botMsg: ChatMessage = {
        id: Date.now().toString(),
        role: Sender.Bot,
        text: cleanText
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
       console.error(error);
       const errorMsg: ChatMessage = {
          id: Date.now().toString(),
          role: Sender.Bot,
          text: "I had trouble processing that request. Please try again or restart the chat."
       };
       setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = async (text: string, msgId: string) => {
    const msgIndex = messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1 || messages[msgIndex].isAudioPlaying) return;

    const newMessages = [...messages];
    newMessages[msgIndex] = { ...newMessages[msgIndex], isAudioPlaying: true };
    setMessages(newMessages);

    try {
      await playAudioStream(await generateSpeech(text));
    } catch (e) {
      console.error("Audio failed", e);
      alert("Could not play audio. Please check your internet connection.");
    } finally {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, isAudioPlaying: false } : m));
    }
  };

  const resetApp = () => {
    setMessages([]);
    setCurrentMode('upload');
    setYoutubeLink('');
    setCurrentTopic(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col transition-colors duration-200">
      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        profile={userProfile}
        history={messages}
        onSaveReport={handleSaveReport}
      />

      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 transition-colors duration-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={resetApp}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="font-bold text-xl text-slate-800 dark:text-white">TutorAI</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsProfileOpen(true)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300 flex items-center space-x-1"
              title="My Profile"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {userProfile.totalSessions > 0 && <span className="text-xs font-bold">{userProfile.totalSessions}</span>}
            </button>

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDarkMode ? (
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-3xl w-full mx-auto p-4 transition-colors duration-200">
        {currentMode === 'upload' ? (
          <div className="flex-1 flex flex-col items-center justify-center animate-fade-in py-8">
            <div className="text-center mb-8 max-w-lg">
              <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight">
                Your Personal <span className="text-indigo-600 dark:text-indigo-400">AI Tutor</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300">
                Stuck on a problem? Upload a photo or paste a YouTube link. We also track your progress!
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
                  placeholder="e.g. https://youtu.be/..."
                  className="w-full pl-4 pr-32 py-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm text-slate-700 dark:text-white placeholder-slate-400"
                  value={youtubeLink}
                  onChange={(e) => setYoutubeLink(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVideoAnalysis()}
                />
                <button
                  onClick={handleVideoAnalysis}
                  disabled={!youtubeLink}
                  className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200 dark:shadow-none"
                >
                  Analyze
                </button>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-center">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                <div className="text-2xl mb-2">🇮🇳</div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Hinglish Mode</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Learns like a friend</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                <div className="text-2xl mb-2">🧠</div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Profile Tracking</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Knows your weak spots</p>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
                <div className="text-2xl mb-2">▶️</div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Video Analysis</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Summarize & Simplify</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 pb-24">
            {messages.map((msg, idx) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === Sender.User ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[90%] md:max-w-[85%] rounded-2xl overflow-hidden shadow-sm transition-colors ${msg.role === Sender.User ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-tl-none'}`}>
                  {msg.image && (
                    <div className="bg-slate-900">
                      <img src={msg.image} alt="Uploaded query" className="w-full max-h-64 object-contain" />
                    </div>
                  )}
                  <div className="p-4 md:p-6">
                    {msg.role === Sender.User ? (
                      <p className="font-medium break-words">{msg.text}</p>
                    ) : (
                      <>
                        <MarkdownRenderer content={msg.text} />
                        
                        {/* Action Bar */}
                        {idx === messages.length - 1 && !isLoading && (
                          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-2">
                             <Button 
                              variant="secondary" 
                              onClick={() => handleAction(ActionType.SIMPLIFY)}
                              title="Simplest explanation possible"
                            >
                              Samajh Nahi Aaya 🤯
                            </Button>
                            <Button 
                              variant="primary" 
                              className="!bg-green-600 hover:!bg-green-700 !shadow-green-200 dark:!shadow-none"
                              onClick={() => updateProfileTopics('strong')}
                            >
                              Got it! 🌟
                            </Button>
                            <Button 
                              variant="outline" 
                              onClick={() => handleAction(ActionType.NOTES)}
                            >
                              Notes 📝
                            </Button>
                             <Button 
                              variant="outline" 
                              onClick={() => handleAction(ActionType.QUIZ)}
                            >
                              Quiz 🧠
                            </Button>
                             <Button 
                              variant="outline" 
                              disabled={msg.isAudioPlaying}
                              onClick={() => handleSpeak(msg.text, msg.id)}
                            >
                              {msg.isAudioPlaying ? '...' : '🔊'}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-none p-4 flex items-center space-x-2 shadow-sm transition-colors">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">TutorAI is thinking...</span>
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