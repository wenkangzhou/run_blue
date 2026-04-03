'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PixelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export function PixelBadge({
  children,
  variant = 'default',
  className,
  ...props
}: PixelBadgeProps) {
  const variants = {
    default: 'bg-zinc-200 text-zinc-800 border-zinc-400 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600',
    primary: 'bg-blue-200 text-blue-800 border-blue-400 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700',
    success: 'bg-green-200 text-green-800 border-green-400 dark:bg-green-900 dark:text-green-200 dark:border-green-700',
    warning: 'bg-yellow-200 text-yellow-800 border-yellow-400 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700',
    danger: 'bg-red-200 text-red-800 border-red-400 dark:bg-red-900 dark:text-red-200 dark:border-red-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-mono font-bold uppercase border-2',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
