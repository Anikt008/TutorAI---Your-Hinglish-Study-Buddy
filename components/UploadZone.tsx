import React, { useRef } from 'react';

interface Props {
  onFileSelect: (file: File) => void;
}

const UploadZone: React.FC<Props> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className="w-full max-w-md mx-auto mt-8 cursor-pointer group"
      onClick={() => inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="border-3 border-dashed border-indigo-200 dark:border-slate-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-400 bg-white dark:bg-slate-800 group-hover:bg-indigo-50/30 dark:group-hover:bg-slate-700/50 rounded-3xl p-10 text-center transition-all duration-300 shadow-sm">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Upload Question</h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">Take a photo of your textbook, homework, or worksheet.</p>
        
        <span className="inline-block bg-indigo-600 dark:bg-indigo-600 text-white px-6 py-2 rounded-full font-medium shadow-md shadow-indigo-200 dark:shadow-none hover:bg-indigo-700">
          Select Photo
        </span>
        <input 
          type="file" 
          ref={inputRef}
          className="hidden" 
          accept="image/*"
          onChange={(e) => {
            if (e.target.files?.[0]) onFileSelect(e.target.files[0]);
          }}
        />
      </div>
    </div>
  );
};

export default UploadZone;