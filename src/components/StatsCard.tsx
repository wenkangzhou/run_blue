'use client';

import React from 'react';
import { PixelCard } from '@/components/ui';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}

export function StatsCard({ title, value, icon: Icon, variant = 'default' }: StatsCardProps) {
  const iconColors = {
    default: 'text-zinc-600 dark:text-zinc-400',
    primary: 'text-blue-600 dark:text-blue-400',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-orange-600 dark:text-orange-400',
  };

  return (
    <PixelCard className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-800 dark:border-zinc-200 ${iconColors[variant]}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase">
            {title}
          </p>
          <p className="font-mono text-2xl font-bold">{value}</p>
        </div>
      </div>
    </PixelCard>
  );
}
