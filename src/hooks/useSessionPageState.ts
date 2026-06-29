'use client';

import React from 'react';
import { readSessionState, writeSessionState } from '@/lib/navigationState';

export function useSessionPageState<T>(
  key: string,
  initialValue: T | (() => T),
  validate?: (value: unknown) => value is T
) {
  const [value, setValue] = React.useState<T>(initialValue);
  const [hydratedKey, setHydratedKey] = React.useState<string | null>(null);
  const initialValueRef = React.useRef(initialValue);
  const validateRef = React.useRef(validate);

  React.useEffect(() => {
    const saved = readSessionState<T>(key, validateRef.current);
    setValue(saved !== null
      ? saved
      : typeof initialValueRef.current === 'function'
        ? (initialValueRef.current as () => T)()
        : initialValueRef.current
    );
    setHydratedKey(key);
  }, [key]);

  React.useEffect(() => {
    if (hydratedKey !== key) return;
    writeSessionState(key, value);
  }, [hydratedKey, key, value]);

  return [value, setValue, hydratedKey === key] as const;
}
