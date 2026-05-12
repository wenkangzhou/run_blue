'use client';

import React, { useState, useEffect } from 'react';
import { TypingText } from './TypingText';

export function TerminalLoader() {
  const [step, setStep] = useState(0);

  const steps = [
    '$ ./bootstrap.sh',
    '> Mounting filesystem...',
    '> Loading activity archive...',
    '> Decoding polylines...',
    '> Rendering trajectory canvas...',
    '> Ready.',
  ];

  useEffect(() => {
    let current = 0;
    const timers: NodeJS.Timeout[] = [];
    const advance = () => {
      current++;
      if (current < steps.length) {
        setStep(current);
        timers.push(setTimeout(advance, 400));
      }
    };
    timers.push(setTimeout(advance, 600));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="border border-zinc-800 bg-zinc-950/80">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500/80" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80" />
            <span className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="text-[10px] text-zinc-600 ml-2">boot_sequence</span>
          </div>
          <div className="p-4 space-y-1 text-xs sm:text-sm">
            {steps.slice(0, step + 1).map((s, i) => (
              <div key={i} className={i === step ? 'text-green-400' : 'text-zinc-500'}>
                {i === step ? (
                  <TypingText text={s} speed={20} showCursor={i === steps.length - 1} />
                ) : (
                  <span className={s.startsWith('>') && s.includes('...') ? 'text-zinc-400' : ''}>{s}</span>
                )}
              </div>
            ))}
            {step >= steps.length - 1 && (
              <div className="pt-2 text-[10px] text-zinc-600 animate-pulse">
                _
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
