'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t-4 border-zinc-800 bg-zinc-100 dark:bg-zinc-900 dark:border-zinc-200">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 border-2 border-blue-800 dark:bg-blue-500 dark:border-blue-700" />
            <span className="font-mono text-sm font-bold">{t('common.appName')}</span>
          </div>
          <p className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
            © {currentYear} {t('common.appName')} · Powered by Strava
          </p>
        </div>
      </div>
    </footer>
  );
}
