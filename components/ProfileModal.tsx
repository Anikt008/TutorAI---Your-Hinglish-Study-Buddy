import React, { useState, useEffect } from 'react';
import { UserProfile, ProgressReport, ChatMessage } from '../types';
import Button from './Button';
import { generateProgressReport } from '../services/geminiService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  history: ChatMessage[];
  onSaveReport: (report: ProgressReport) => void;
}

const ProfileModal: React.FC<Props> = ({ isOpen, onClose, profile, history, onSaveReport }) => {
  const [report, setReport] = useState<ProgressReport | null>(profile.progressReport || null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Sync local report state if the profile updates (e.g. from parent or initial load)
    if (profile.progressReport) {
      setReport(profile.progressReport);
    }
  }, [profile.progressReport]);

  if (!isOpen) return null;

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
      const result = await generateProgressReport(history);
      const newReport = {
        ...result,
        generatedAt: Date.now()
      };
      setReport(newReport);
      onSaveReport(newReport); // Save to local storage via App.tsx
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">🎓 Student Profile</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800">
              <h3 className="text-green-800 dark:text-green-300 font-semibold mb-1">Mastered Topics 🌟</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {profile.strongTopics.length > 0 ? (
                  profile.strongTopics.map((topic, i) => (
                    <span key={i} className="px-2 py-1 bg-white dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs rounded-md shadow-sm border border-green-100 dark:border-green-800">
                      {topic}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-green-600/70 italic">No topics mastered yet.</span>
                )}
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800">
              <h3 className="text-amber-800 dark:text-amber-300 font-semibold mb-1">Focus Areas 💪</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {profile.weakTopics.length > 0 ? (
                  profile.weakTopics.map((topic, i) => (
                    <span key={i} className="px-2 py-1 bg-white dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs rounded-md shadow-sm border border-amber-100 dark:border-amber-800">
                      {topic}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-amber-600/70 italic">Great job! No weak areas.</span>
                )}
              </div>
            </div>
          </div>

          {/* AI Analysis Section */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">🤖 AI Progress Report</h3>
              <Button 
                variant="primary" 
                onClick={handleGenerateReport} 
                disabled={isGenerating || history.length === 0}
                className="text-sm py-1 px-3"
              >
                {isGenerating ? 'Analyzing...' : 'Generate Report'}
              </Button>
            </div>

            {!report ? (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500">
                <p>Click "Generate Report" to analyze your learning patterns and common mistakes.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h4 className="font-semibold text-red-500 dark:text-red-400 mb-2 flex items-center">
                    <span className="mr-2">⚠️</span> Common Mistakes
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 text-sm">
                    {report.commonMistakes.map((mistake, i) => (
                      <li key={i}>{mistake}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-indigo-500 dark:text-indigo-400 mb-2 flex items-center">
                    <span className="mr-2">💡</span> Personalized Tips
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300 text-sm">
                    {report.learningTips.map((tip, i) => (
                      <li key={i}>{tip}</li>
                    ))}
                  </ul>
                </div>
                <div className="text-xs text-slate-400 text-right mt-2">
                  Generated {new Date(report.generatedAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-3xl">
          <Button variant="outline" onClick={onClose} className="w-full">Close Profile</Button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;