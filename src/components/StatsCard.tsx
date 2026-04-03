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
    default: 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800',
    primary: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30',
    success: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30',
    warning: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30',
  };

  return (
    <PixelCard className="p-3">
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded ${iconColors[variant]}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 uppercase truncate">
            {title}
          </p>
          <p className="font-mono text-lg font-bold truncate">{value}</p>
        </div>
      </div>
    </PixelCard>
  );
}
