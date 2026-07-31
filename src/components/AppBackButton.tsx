'use client';

import React from 'react';
import { useAppBack } from '@/hooks/useAppBack';

interface AppBackButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  fallback: string;
}

export function AppBackButton({ fallback, type = 'button', ...props }: AppBackButtonProps) {
  const handleBack = useAppBack(fallback);
  return <button {...props} type={type} onClick={handleBack} />;
}
