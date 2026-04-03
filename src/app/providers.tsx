'use client';

import React from 'react';
import { ThemeProvider } from 'next-themes';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </ThemeProvider>
  );
}
