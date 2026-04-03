'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function PixelButton({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className,
  disabled,
  ...props
}: PixelButtonProps) {
  const baseStyles = 'font-mono font-bold uppercase tracking-wider transition-all duration-100 active:translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-blue-600 text-white border-4 border-blue-800 hover:bg-blue-500 dark:bg-blue-700 dark:border-blue-900 dark:hover:bg-blue-600',
    secondary: 'bg-zinc-200 text-zinc-900 border-4 border-zinc-400 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:border-zinc-600 dark:hover:bg-zinc-600',
    outline: 'bg-transparent text-blue-600 border-4 border-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-400 dark:hover:bg-blue-950',
    ghost: 'bg-transparent text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800',
  };

  const sizes = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        'shadow-[4px_4px_0px_0px_rgba(0,0,0,0.3)] active:shadow-none',
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <span className="animate-pulse">◼</span>
          <span className="animate-pulse delay-75">◼</span>
          <span className="animate-pulse delay-150">◼</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
