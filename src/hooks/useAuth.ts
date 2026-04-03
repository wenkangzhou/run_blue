'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSettingsStore } from '@/store/settings';
import { useTranslation } from 'react-i18next';

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, logout } = useAuthStore();
  const { language } = useSettingsStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  const handleLogin = () => {
    window.location.href = '/api/auth/signin';
  };

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    logout();
    window.location.href = '/';
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    login: handleLogin,
    logout: handleLogout,
    setUser,
  };
}
