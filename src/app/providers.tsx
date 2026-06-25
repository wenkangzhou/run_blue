'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { ScrollRestoration } from '@/components/ScrollRestoration';
import { ConfirmDialogProvider } from '@/components/ConfirmDialogProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          </Suspense>
          {mounted ? children : <div style={{ visibility: 'hidden' }}>{children}</div>}
        </ConfirmDialogProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}
