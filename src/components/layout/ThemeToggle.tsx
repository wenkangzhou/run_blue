'use client';

import React from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="p-2 border-2 border-zinc-800 dark:border-zinc-200">
        <Monitor size={18} />
      </button>
    );
  }

  const themes: Array<{ value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }> = [
    { value: 'light', icon: <Sun size={18} />, label: t('theme.light') },
    { value: 'dark', icon: <Moon size={18} />, label: t('theme.dark') },
    { value: 'system', icon: <Monitor size={18} />, label: t('theme.system') },
  ];

  const currentTheme = themes.find((t) => t.value === theme) || themes[2];

  return (
    <div className="relative group">
      <button className="p-2 border-2 border-zinc-800 dark:border-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
        {currentTheme.icon}
      </button>
      <div className="absolute right-0 top-full mt-2 hidden group-hover:flex flex-col gap-1 bg-white dark:bg-zinc-900 border-2 border-zinc-800 dark:border-zinc-200 p-1 min-w-[120px]">
        {themes.map((t) => (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-mono hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
              theme === t.value ? 'bg-blue-100 dark:bg-blue-900' : ''
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
