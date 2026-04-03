'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PixelCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'primary' | 'secondary';
  noShadow?: boolean;
}

export function PixelCard({
  children,
  variant = 'default',
  noShadow = false,
  className,
  ...props
}: PixelCardProps) {
  const baseStyles = 'border-4 bg-white dark:bg-zinc-900';
  
  const variants = {
    default: 'border-zinc-800 dark:border-zinc-200',
    primary: 'border-blue-800 dark:border-blue-600',
    secondary: 'border-zinc-400 dark:border-zinc-600',
  };

  return (
    <div
      className={cn(
        baseStyles,
        variants[variant],
        !noShadow && 'shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)] dark:shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
