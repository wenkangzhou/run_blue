'use client';

import React from 'react';
import { PixelCard, PixelButton } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container mx-auto px-4 py-16">
      <PixelCard variant="secondary" className="max-w-md mx-auto p-8 text-center">
        <h2 className="font-pixel text-2xl font-bold mb-4 text-red-600">
          Something went wrong!
        </h2>
        <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-6">
          {error.message || 'An unexpected error occurred'}
        </p>
        <PixelButton onClick={reset}>Try again</PixelButton>
      </PixelCard>
    </div>
  );
}
