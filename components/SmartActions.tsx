
import React from 'react';
import { ActionType } from '../types';

interface Props {
  onAction: (action: ActionType) => void;
  disabled: boolean;
}

const SmartActions: React.FC<Props> = ({ onAction, disabled }) => {
  const actions = [
    { type: ActionType.SIMPLIFY, label: '🤯 Samajh Nahi Aaya', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
    { type: ActionType.ELI5, label: '👶 Explain Like I’m 5', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
    { type: ActionType.DIAGRAM, label: '📐 Visual Diagram', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    { type: ActionType.MNEMONIC, label: '🧠 Memory Trick', color: 'bg-pink-100 text-pink-700 hover:bg-pink-200' },
    { type: ActionType.NOTES, label: '📝 Exam Notes', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
    { type: ActionType.REVISION, label: '⚡ Quick Revision', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
    { type: ActionType.QUIZ, label: '❓ Quiz Me', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  ];

  return (
    <div className="flex flex-nowrap overflow-x-auto gap-2 py-3 px-1 scrollbar-hide snap-x">
      {actions.map((action) => (
        <button
          key={action.type}
          onClick={() => onAction(action.type)}
          disabled={disabled}
          className={`flex-none snap-start px-4 py-2 rounded-full text-sm font-semibold transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent shadow-sm ${action.color}`}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

export default SmartActions;
