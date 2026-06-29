'use client';

import React, { Suspense } from 'react';
import { ThemeProvider } from 'next-themes';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { ScrollRestoration } from '@/components/ScrollRestoration';
import { ConfirmDialogProvider } from '@/components/ConfirmDialogProvider';
import { NavigationProgress } from '@/components/NavigationProgress';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <I18nextProvider i18n={i18n}>
        <ConfirmDialogProvider>
          <Suspense fallback={null}>
            <ScrollRestoration />
            <NavigationProgress />
          </Suspense>
          {children}
        </ConfirmDialogProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
