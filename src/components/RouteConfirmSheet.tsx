'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';

export type RouteConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
};

export function RouteConfirmSheet({
  action,
  onCancel,
  onConfirm,
}: {
  action: RouteConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const isDanger = action.variant === 'danger';

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="route-confirm-title"
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start gap-3">
          <div className={[
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
            isDanger
              ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300'
              : 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300',
          ].join(' ')}>
            <AlertTriangle size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="route-confirm-title" className="font-mono text-sm font-bold text-zinc-950 dark:text-zinc-50">
              {action.title}
            </h2>
            <p className="mt-2 font-mono text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {action.description}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 font-mono text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              'inline-flex h-10 items-center justify-center rounded-lg px-3 font-mono text-xs font-bold text-white transition-colors',
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700',
            ].join(' ')}
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
