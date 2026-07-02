'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useSettingsStore } from '@/store/settings';
import { useTranslation } from 'react-i18next';
import {
  shouldClearAuthStateForSessionError,
  shouldPromptReauthForSessionError,
} from '@/lib/authPersistence';
import { isGuestUser } from '@/lib/guestMode';
import { getClientSession, invalidateClientSessionCache } from '@/lib/clientSession';

export function useAuth() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, setUser, logout } = useAuthStore();
  const { language } = useSettingsStore();
  const { i18n } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const checkedSessionKeyRef = useRef<string | null>(null);

  // Initialize language
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language, i18n]);

  // Check auth status on mount
  useEffect(() => {
    if (isGuestUser(user)) {
      useAuthStore.getState().setLoading(false);
      setNeedsReauth(false);
      setIsReady(true);
      return;
    }

    // Skip only when the in-memory session already has a token. Persisted auth
    // deliberately strips tokens and must be hydrated from the HttpOnly cookie.
    if (user?.accessToken) {
      setIsReady(true);
      return;
    }

    const sessionKey = user?.id ? `persisted:${user.id}` : 'anonymous';
    if (checkedSessionKeyRef.current === sessionKey) {
      setIsReady(true);
      return;
    }
    checkedSessionKeyRef.current = sessionKey;

    const checkAuth = async () => {
      try {
        const session = await getClientSession();
        if (session?.user) {
          setUser({
            id: session.user.id,
            stravaId: session.stravaId ?? Number(session.user.id),
            email: session.user.email || '',
            name: session.user.name || '',
            image: session.user.image || null,
            accessToken: session.accessToken || '',
            refreshToken: '',
            expiresAt: session.expiresAt || 0,
          });
        } else if (shouldClearAuthStateForSessionError(session.error, session.status)) {
          if (shouldPromptReauthForSessionError(session.error, session.status)) {
            setNeedsReauth(true);
          }
          checkedSessionKeyRef.current = 'anonymous';
          logout();
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
      const session = await getClientSession({ force: true });
      if (session?.user) {
        setNeedsReauth(false);
        setUser({
          id: session.user.id,
          stravaId: session.stravaId ?? Number(session.user.id),
          email: session.user.email || '',
          name: session.user.name || '',
          image: session.user.image || null,
          accessToken: session.accessToken || '',
          refreshToken: '',
          expiresAt: session.expiresAt || 0,
        });
        return true;
      }
      if (shouldPromptReauthForSessionError(session.error, session.status)) setNeedsReauth(true);
      return false;
    } catch {
      return false;
    }
  }, [setUser]);

  const handleLogin = () => {
    if (isGuestUser(user)) {
      logout();
    }
    invalidateClientSessionCache();
    window.location.assign('/api/auth/signin/strava');
  };

  const handleLogout = async () => {
    if (isGuestUser(user)) {
      logout();
      router.push('/');
      return;
    }

    await fetch('/api/auth/signout', { method: 'POST' });
    invalidateClientSessionCache();
    logout();
    router.push('/');
  };

  return {
    user,
    isAuthenticated,
    isLoading: isLoading && !isReady,
    needsReauth,
    login: handleLogin,
    logout: handleLogout,
    setUser,
    refreshSession,
  };
}
