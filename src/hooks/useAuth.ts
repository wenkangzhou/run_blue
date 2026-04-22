'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSettingsStore } from '@/store/settings';
import { useTranslation } from 'react-i18next';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, logout } = useAuthStore();
  const { language } = useSettingsStore();
  const { i18n } = useTranslation();
  const [isReady, setIsReady] = useState(false);

  // Initialize language
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Check auth status on mount
  useEffect(() => {
    // Skip if already authenticated (reduces Strava API calls)
    if (user) {
      setIsReady(true);
      return;
    }

    const checkAuth = async () => {
      try {
        // Try to get user from cookie/localStorage or API
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const session = await response.json();
          if (session?.user) {
            setUser({
              id: session.user.id,
              stravaId: session.stravaId,
              email: session.user.email || '',
              name: session.user.name || '',
              image: session.user.image || null,
              accessToken: session.accessToken || '',
              refreshToken: session.refreshToken || '',
              expiresAt: session.expiresAt || 0,
            });
          } else if (session.error === 'token_expired') {
            // Token expired, need to re-login
            console.log('Token expired, redirecting to login');
            logout();
          } else {
            // No session, set loading to false
            useAuthStore.getState().setLoading(false);
          }
        } else {
          useAuthStore.getState().setLoading(false);
        }
      } catch {
        useAuthStore.getState().setLoading(false);
      } finally {
        setIsReady(true);
      }
    };

    checkAuth();
  }, [setUser, logout, user]);

  // Force refresh session - useful after OAuth callback
  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const session = await response.json();
        if (session?.user) {
          setUser({
            id: session.user.id,
            stravaId: session.stravaId,
            email: session.user.email || '',
            name: session.user.name || '',
            image: session.user.image || null,
            accessToken: session.accessToken || '',
            refreshToken: session.refreshToken || '',
            expiresAt: session.expiresAt || 0,
          });
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [setUser]);

  const handleLogin = () => {
    router.push('/api/auth/signin/strava');
  };

  const handleLogout = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    logout();
    router.push('/');
  };

  return {
    user,
    isAuthenticated,
    isLoading: isLoading && !isReady,
    login: handleLogin,
    logout: handleLogout,
    setUser,
    refreshSession,
  };
}
