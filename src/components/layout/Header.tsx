'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { PixelButton } from '@/components/ui';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { Menu, X } from 'lucide-react';

export function Header() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b-4 border-zinc-800 bg-white dark:bg-zinc-900 dark:border-zinc-200">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 border-4 border-blue-800 dark:bg-blue-500 dark:border-blue-700" />
            <span className="font-mono text-xl font-bold tracking-tighter">
              {t('common.appName')}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {isAuthenticated && (
              <>
                <Link
                  href="/dashboard"
                  className="font-mono text-sm font-bold uppercase hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {t('nav.dashboard')}
                </Link>
                <Link
                  href="/activities"
                  className="font-mono text-sm font-bold uppercase hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  {t('nav.activities')}
                </Link>
              </>
            )}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {user?.image && (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="w-8 h-8 border-2 border-zinc-800 dark:border-zinc-200"
                  />
                )}
                <PixelButton variant="outline" size="sm" onClick={logout}>
                  {t('common.logout')}
                </PixelButton>
              </div>
            ) : (
              <PixelButton size="sm" onClick={() => window.location.href = '/api/auth/signin/strava'}>
                {t('common.login')}
              </PixelButton>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 border-2 border-zinc-800 dark:border-zinc-200"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t-2 border-zinc-200 dark:border-zinc-700 py-4">
            <nav className="flex flex-col gap-3">
              {isAuthenticated && (
                <>
                  <Link
                    href="/dashboard"
                    className="font-mono text-sm font-bold uppercase py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.dashboard')}
                  </Link>
                  <Link
                    href="/activities"
                    className="font-mono text-sm font-bold uppercase py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {t('nav.activities')}
                  </Link>
                </>
              )}
              <div className="flex items-center gap-3 py-2">
                <LanguageToggle />
                <ThemeToggle />
              </div>
              {isAuthenticated ? (
                <PixelButton variant="outline" size="sm" onClick={logout}>
                  {t('common.logout')}
                </PixelButton>
              ) : (
                <PixelButton size="sm" onClick={() => window.location.href = '/api/auth/signin/strava'}>
                  {t('common.login')}
                </PixelButton>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
