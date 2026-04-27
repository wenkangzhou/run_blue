'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { PixelButton } from '@/components/ui';
import { UserProfileModal } from '@/components/UserProfileModal';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { Menu, X, Settings, Dumbbell, Trophy, BarChart3, MapPinned, Footprints, Activity, User } from 'lucide-react';

export function Header() {
  const { t } = useTranslation();
  const { isAuthenticated, user, logout, needsReauth, login } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  return (
    <header 
      className="sticky top-0 w-full border-b-4 border-zinc-800 bg-white dark:bg-zinc-900 dark:border-zinc-200"
      style={{ zIndex: 9999 }}
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="跑蓝"
              className="w-8 h-8 object-contain"
            />
            <span className="font-mono text-xl font-bold tracking-tighter">
              {t('common.appName')}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5">
            {isAuthenticated && (
              <>
                <Link
                  href="/activities"
                  className="font-mono text-sm font-bold uppercase hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1"
                >
                  <Activity size={14} />
                  {t('nav.activities')}
                </Link>
                <Link
                  href="/plans"
                  className="font-mono text-sm font-bold uppercase hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1"
                >
                  <Dumbbell size={14} />
                  {t('trainingPlan.title', '训练计划')}
                </Link>
                <Link
                  href="/stats"
                  className="font-mono text-sm font-bold uppercase hover:text-green-600 dark:hover:text-green-400 transition-colors inline-flex items-center gap-1"
                >
                  <BarChart3 size={14} />
                  {t('nav.stats', '统计')}
                </Link>
                <Link
                  href="/routes"
                  className="font-mono text-sm font-bold uppercase hover:text-purple-600 dark:hover:text-purple-400 transition-colors inline-flex items-center gap-1"
                >
                  <MapPinned size={14} />
                  {t('nav.routes', '路线')}
                </Link>
                <Link
                  href="/gear"
                  className="font-mono text-sm font-bold uppercase hover:text-orange-600 dark:hover:text-orange-400 transition-colors inline-flex items-center gap-1"
                >
                  <Footprints size={14} />
                  {t('nav.gear', '跑鞋')}
                </Link>
                <Link
                  href="/activities?wrapped=1"
                  className="font-mono text-sm font-bold uppercase hover:text-amber-600 dark:hover:text-amber-400 transition-colors inline-flex items-center gap-1"
                >
                  <Trophy size={14} />
                  {t('wrapped.title', '年度回顾')}
                </Link>
              </>
            )}
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <ThemeToggle />
            {needsReauth ? (
              <button
                onClick={login}
                className="px-3 py-1.5 font-mono text-xs font-bold uppercase bg-amber-100 text-amber-700 border-2 border-amber-400 hover:bg-amber-200 transition-colors"
              >
                {t('auth.relogin', '重新登录')}
              </button>
            ) : isAuthenticated && (
              <div className="flex items-center gap-3">
                <PixelButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsProfileOpen(true)}
                  title={t('profile.title')}
                >
                  <User size={18} />
                </PixelButton>
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
            )}
          </div>

          {/* Mobile Menu Button & Avatar */}
          <div className="md:hidden flex items-center gap-2">
            {isAuthenticated && user?.image && (
              <img
                src={user.image}
                alt={user.name}
                className="w-8 h-8 border-2 border-zinc-800 dark:border-zinc-200"
              />
            )}
            <button
              className="p-2 border-2 border-zinc-800 dark:border-zinc-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden border-t-2 border-zinc-200 dark:border-zinc-700 py-4">
            <nav className="flex flex-col gap-3">
              {isAuthenticated && (
                <>
                  <Link
                    href="/activities"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Activity size={16} />
                    {t('nav.activities')}
                  </Link>
                  <Link
                    href="/plans"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Dumbbell size={16} />
                    {t('trainingPlan.title', '训练计划')}
                  </Link>
                  <Link
                    href="/stats"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <BarChart3 size={16} />
                    {t('nav.stats', '统计')}
                  </Link>
                  <Link
                    href="/routes"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <MapPinned size={16} />
                    {t('nav.routes', '路线')}
                  </Link>
                  <Link
                    href="/gear"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Footprints size={16} />
                    {t('nav.gear', '跑鞋')}
                  </Link>
                  <Link
                    href="/activities?wrapped=1"
                    className="font-mono text-sm font-bold uppercase py-2 inline-flex items-center gap-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Trophy size={16} />
                    {t('wrapped.title', '年度回顾')}
                  </Link>
                  <button
                    className="font-mono text-sm font-bold uppercase py-2 text-left inline-flex items-center gap-2"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsProfileOpen(true);
                    }}
                  >
                    <User size={16} />
                    {t('profile.title')}
                  </button>
                </>
              )}
              <div className="flex items-center gap-3 py-2">
                <LanguageToggle />
                <ThemeToggle />
              </div>
              {needsReauth ? (
                <button
                  onClick={() => { setIsMenuOpen(false); login(); }}
                  className="font-mono text-sm font-bold uppercase py-2 text-amber-700"
                >
                  {t('auth.relogin', '重新登录')}
                </button>
              ) : isAuthenticated && (
                <PixelButton variant="outline" size="sm" onClick={() => { setIsMenuOpen(false); logout(); }}>
                  {t('common.logout')}
                </PixelButton>
              )}
            </nav>
          </div>
        )}
      </div>

      <UserProfileModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </header>
  );
}
