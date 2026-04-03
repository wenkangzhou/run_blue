'use client';

import Link from 'next/link';
import { PixelCard, PixelButton } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="container mx-auto px-4 py-16">
      <PixelCard className="max-w-md mx-auto p-8 text-center">
        <h1 className="font-pixel text-6xl font-bold mb-4">404</h1>
        <p className="font-mono text-zinc-600 dark:text-zinc-400 mb-6">
          Page not found
        </p>
        <Link href="/">
          <PixelButton>Go Home</PixelButton>
        </Link>
      </PixelCard>
    </div>
  );
}
