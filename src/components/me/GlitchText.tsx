'use client';

import React from 'react';

interface GlitchTextProps {
  text: string;
  className?: string;
}

export function GlitchText({ text, className = '' }: GlitchTextProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <span
        className="absolute inset-0 z-0 text-red-400/50 animate-pulse"
        style={{ clipPath: 'inset(0 0 50% 0)', transform: 'translateX(2px)' }}
        aria-hidden
      >
        {text}
      </span>
      <span
        className="absolute inset-0 z-0 text-green-400/50 animate-pulse"
        style={{ clipPath: 'inset(50% 0 0 0)', transform: 'translateX(-2px)', animationDelay: '100ms' }}
        aria-hidden
      >
        {text}
      </span>
    </span>
  );
}
