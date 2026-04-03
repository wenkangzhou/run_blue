'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { User } from '@/types';

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser?: User | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    if (initialUser) {
      setUser(initialUser);
    } else {
      setLoading(false);
    }
  }, [initialUser, setUser, setLoading]);

  return <>{children}</>;
}
