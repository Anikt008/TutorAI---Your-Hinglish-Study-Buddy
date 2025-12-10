import React from 'react';

interface Props {
  content: string;
}

const MarkdownRenderer: React.FC<Props> = React.memo(({ content }) => {
  // Safe guard against null/undefined content
  if (!content) return null;

  // A basic markdown parser that handles code blocks, headers, lists, and bold text.
  
  const formatText = (text: string) => {
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, index) => {
      // Handle Code Blocks
      if (part.startsWith('```') && part.endsWith('```')) {
        const codeContent = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
        return (
          <div key={index} className="bg-slate-900 text-slate-100 p-4 rounded-xl my-4 overflow-x-auto font-mono text-sm border border-slate-700">
            <pre>{codeContent}</pre>
          </div>
        );
      }
      
      // Handle regular Markdown
      return (
        <div key={index}>
          {part.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('### ')) return <h3 key={`${index}-${i}`} className="text-lg font-bold text-indigo-700 dark:text-indigo-300 mt-4 mb-2">{line.replace('### ', '')}</h3>;
            if (line.startsWith('## ')) return <h2 key={`${index}-${i}`} className="text-xl font-bold text-indigo-800 dark:text-indigo-300 mt-5 mb-3">{line.replace('## ', '')}</h2>;
            if (line.startsWith('# ')) return <h1 key={`${index}-${i}`} className="text-2xl font-bold text-indigo-900 dark:text-indigo-200 mt-6 mb-4">{line.replace('# ', '')}</h1>;
            
            // List items
            if (line.trim().startsWith('- ')) {
               const content = line.trim().substring(2);
               return <div key={`${index}-${i}`} className="flex ml-2 my-1"><span className="mr-2 text-indigo-500">•</span><span className="text-slate-700 dark:text-slate-300">{parseInline(content)}</span></div>
            }

            // Empty lines
            if (line.trim() === '') return <div key={`${index}-${i}`} className="h-2"></div>;

            return <p key={`${index}-${i}`} className="mb-2 text-slate-700 dark:text-slate-300 leading-relaxed">{parseInline(line)}</p>;
          })}
        </div>
      );
    });
  };

  const parseInline = (text: string) => {
    // Basic inline parser for bold text (**text**)
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-bold text-slate-900 dark:text-yellow-100 bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="prose prose-indigo max-w-none dark:prose-invert">
      {formatText(content)}
    </div>
  );
});

export default MarkdownRenderer;