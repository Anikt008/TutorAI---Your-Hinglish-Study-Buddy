
import React from 'react';
import { AppMode, UserProfile } from '../types';

interface Props {
  currentMode: AppMode;
  onNavigate: (mode: AppMode) => void;
  profile: UserProfile;
  isOpen: boolean;
  onToggle: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onNewChat: () => void;
}

const Sidebar: React.FC<Props> = ({ currentMode, onNavigate, profile, isOpen, onToggle, isDarkMode, onToggleTheme, onNewChat }) => {
  const menuItems = [
    { mode: AppMode.DASHBOARD, label: '📊 Dashboard', desc: 'Progress & Stats' },
    { mode: AppMode.UPLOAD, label: '🏠 Home', desc: 'Upload & Start' },
    { mode: AppMode.CHAT, label: '💬 Chat', desc: 'Current Session' },
    { mode: AppMode.HISTORY, label: '📜 History', desc: 'Past Sessions' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={onToggle} />}
      
      <aside className={`fixed md:static inset-y-0 left-0 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} flex flex-col`}>
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-md">
              T
            </div>
            <span className="font-bold text-xl text-slate-800 dark:text-white">TutorAI</span>
          </div>
          <button onClick={onToggle} className="md:hidden text-slate-500">✕</button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 pb-0">
          <button 
            onClick={() => { onNewChat(); if (window.innerWidth < 768) onToggle(); }}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white p-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all transform active:scale-95 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Chat
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.mode}
              onClick={() => { onNavigate(item.mode); if (window.innerWidth < 768) onToggle(); }}
              className={`w-full flex items-center p-3 rounded-xl transition-all ${currentMode === item.mode ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
            >
              <div className="text-left">
                <div className="font-medium">{item.label}</div>
                <div className="text-xs opacity-70 font-normal">{item.desc}</div>
              </div>
            </button>
          ))}
        </nav>

        {/* Footer Stats & Theme Toggle */}
        <div className="p-4 m-4 space-y-3">
           {/* Streak Card */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">My Streak</div>
            <div className="flex items-center gap-2 text-orange-500 font-bold text-xl">
              🔥 {profile.streakDays || 0} Days
            </div>
            <p className="text-xs text-slate-400 mt-1">Keep learning to grow!</p>
          </div>

          {/* Theme Toggle Button */}
          <button 
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors group"
          >
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Theme</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 dark:text-slate-500">{isDarkMode ? 'Dark' : 'Light'}</span>
              {isDarkMode ? (
                <span className="text-indigo-400">🌙</span> 
              ) : (
                <span className="text-amber-500">☀️</span>
              )}
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
