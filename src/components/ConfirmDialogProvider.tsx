'use client';

import React from 'react';
import { AlertTriangle, Info, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ConfirmDialogTone = 'default' | 'danger';

interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
}

interface ConfirmDialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null);

export function useConfirmDialog() {
  const context = React.useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return context.confirm;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = React.useState<ConfirmDialogOptions | null>(null);
  const resolverRef = React.useRef<((confirmed: boolean) => void) | null>(null);
  const cancelButtonRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  const closeDialog = React.useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(confirmed);
  }, []);

  const confirm = React.useCallback((options: ConfirmDialogOptions) => (
    new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setDialog(options);
    })
  ), []);

  React.useEffect(() => () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(false);
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeDialog, dialog]);

  const contextValue = React.useMemo(() => ({ confirm }), [confirm]);
  const isDanger = dialog?.tone === 'danger';
  const title = dialog?.title || t('common.confirmTitle');

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[11000] flex items-end justify-center p-3 sm:items-center sm:p-5"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-zinc-950/65 backdrop-blur-[2px]"
            onClick={() => closeDialog(false)}
            tabIndex={-1}
            aria-hidden="true"
          />
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            aria-describedby="app-confirm-message"
            className="relative w-full max-w-sm overflow-hidden border-2 border-zinc-900 bg-white shadow-[8px_8px_0_rgba(0,0,0,0.28)] dark:border-zinc-100 dark:bg-zinc-950"
          >
            <div className="flex items-start gap-3 border-b border-zinc-200 p-4 dark:border-zinc-800">
              <div
                className={[
                  'flex h-10 w-10 shrink-0 items-center justify-center border-2',
                  isDanger
                    ? 'border-red-300 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
                ].join(' ')}
              >
                {isDanger ? <Trash2 size={18} /> : <Info size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="app-confirm-title"
                  className="font-pixel text-sm font-bold text-zinc-950 dark:text-zinc-50"
                >
                  {title}
                </h2>
                <p
                  id="app-confirm-message"
                  className="mt-2 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-300"
                >
                  {dialog.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closeDialog(false)}
                className="shrink-0 p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                aria-label={t('common.close')}
              >
                <X size={17} />
              </button>
            </div>

            {isDanger && (
              <div className="mx-4 mt-3 flex items-start gap-2 border-l-2 border-red-400 bg-red-50/70 px-3 py-2 dark:bg-red-950/20">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
                <p className="font-mono text-[10px] leading-relaxed text-red-700 dark:text-red-300">
                  {t('common.irreversibleAction')}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 p-4">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => closeDialog(false)}
                className="border-2 border-zinc-300 bg-white px-3 py-2.5 font-mono text-xs font-bold text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:focus:ring-offset-zinc-950"
              >
                {dialog.cancelLabel || t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => closeDialog(true)}
                className={[
                  'border-2 px-3 py-2.5 font-mono text-xs font-bold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-zinc-950',
                  isDanger
                    ? 'border-red-800 bg-red-600 hover:bg-red-500 focus:ring-red-500'
                    : 'border-blue-800 bg-blue-600 hover:bg-blue-500 focus:ring-blue-500',
                ].join(' ')}
              >
                {dialog.confirmLabel || t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
}
