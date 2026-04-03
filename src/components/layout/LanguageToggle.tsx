'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settings';
import { Globe } from 'lucide-react';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const { language, setLanguage } = useSettingsStore();

  const toggleLanguage = () => {
    const newLang = language === 'zh' ? 'en' : 'zh';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="p-2 border-2 border-zinc-800 dark:border-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors font-mono text-sm font-bold"
    >
      <span className="flex items-center gap-1">
        <Globe size={16} />
        {language === 'zh' ? 'EN' : '中'}
      </span>
    </button>
  );
}
