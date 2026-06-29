import React from 'react';

interface FadeInSectionProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeInSection({ children, className = '' }: FadeInSectionProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
