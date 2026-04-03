import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  language: 'en' | 'zh';
  unit: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'system';
  setLanguage: (language: 'en' | 'zh') => void;
  setUnit: (unit: 'metric' | 'imperial') => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'zh',
      unit: 'metric',
      theme: 'system',
      setLanguage: (language) => set({ language }),
      setUnit: (unit) => set({ unit }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
