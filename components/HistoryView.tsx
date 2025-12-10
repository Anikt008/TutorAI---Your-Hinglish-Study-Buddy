import React, { useState } from 'react';
import { ChatSession } from '../types';
import Button from './Button';

interface Props {
  sessions: ChatSession[];
  onSelect: (session: ChatSession) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

const HistoryView: React.FC<Props> = ({ sessions, onSelect, onDelete, onClear }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const filteredSessions = sessions
    .filter(session => {
      const query = searchQuery.toLowerCase();
      const titleMatch = session.title.toLowerCase().includes(query);
      // Safe access using optional chaining
      const messageMatch = session.messages?.some(m => m.text.toLowerCase().includes(query));
      return titleMatch || messageMatch;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center animate-fade-in px-4">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-2">No History Yet</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm">
          Start a new chat to track your learning journey here.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">History</h2>
        <Button variant="outline" onClick={onClear} className="text-sm">
          Clear All
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-3 py-3 border border-slate-200 dark:border-slate-700 rounded-xl leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
          placeholder="Search topics or keywords..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredSessions.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 border-dashed">
           <p className="text-slate-500 dark:text-slate-400">No matching history found.</p>
           <button 
             onClick={() => setSearchQuery('')}
             className="mt-2 text-indigo-600 hover:text-indigo-500 text-sm font-medium"
           >
             Clear search
           </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredSessions.map((session) => (
            <div 
              key={session.id} 
              className="group relative bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer"
              onClick={() => onSelect(session)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 pr-10">
                  <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 mb-1 truncate">
                    {session.title || "Untitled Session"}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {formatDate(session.timestamp)} • {session.messages?.length || 0} messages
                  </p>
                  {/* Preview of last message with safety check */}
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 line-clamp-1 opacity-80">
                    {session.messages && session.messages.length > 0 
                      ? session.messages[session.messages.length - 1].text 
                      : "No messages"}
                  </p>
                </div>
                
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(session.id);
                  }}
                  className="absolute right-4 top-4 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  title="Delete Session"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryView;