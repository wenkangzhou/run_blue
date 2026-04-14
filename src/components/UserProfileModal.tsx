'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton, PixelCard, PixelBadge } from '@/components/ui';
import {
  getUserProfile,
  saveUserProfile,
  parseTimeToSeconds,
  formatSecondsToTime,
  type UserProfilePBs,
} from '@/lib/userProfile';
import { X, Trophy, Clock, AlertCircle } from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PB_KEYS: Array<{ key: keyof UserProfilePBs; labelKey: string }> = [
  { key: '5k', labelKey: 'profile.pb5k' },
  { key: '10k', labelKey: 'profile.pb10k' },
  { key: '21k', labelKey: 'profile.pbHalf' },
  { key: '42k', labelKey: 'profile.pbFull' },
];

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<keyof UserProfilePBs, string>>({
    '5k': '',
    '10k': '',
    '21k': '',
    '42k': '',
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [showSaved, setShowSaved] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const profile = getUserProfile();
    if (profile) {
      setValues({
        '5k': formatSecondsToTime(profile.pbs['5k']),
        '10k': formatSecondsToTime(profile.pbs['10k']),
        '21k': formatSecondsToTime(profile.pbs['21k']),
        '42k': formatSecondsToTime(profile.pbs['42k']),
      });
      setHasProfile(true);
    } else {
      setValues({ '5k': '', '10k': '', '21k': '', '42k': '' });
      setHasProfile(false);
    }
    setErrors({});
    setShowSaved(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (key: keyof UserProfilePBs, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleSave = () => {
    const newErrors: Record<string, boolean> = {};
    const pbs: UserProfilePBs = {
      '5k': null,
      '10k': null,
      '21k': null,
      '42k': null,
    };

    let hasAny = false;
    for (const { key } of PB_KEYS) {
      const raw = values[key].trim();
      if (!raw) continue;
      const seconds = parseTimeToSeconds(raw);
      if (seconds === null) {
        newErrors[key] = true;
      } else {
        pbs[key] = seconds;
        hasAny = true;
      }
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    saveUserProfile({ pbs });
    setHasProfile(hasAny);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <div
        className="absolute inset-0 bg-black/60 dark:bg-black/70"
        onClick={onClose}
      />
      <PixelCard
        variant="default"
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border-4 border-zinc-800 dark:border-zinc-200 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <Trophy size={20} />
              </div>
              <div>
                <h2 className="font-mono text-lg font-bold leading-tight">
                  {t('profile.title')}
                </h2>
                <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                  {t('common.personalBests')}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:opacity-70"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </div>

          <p className="font-mono text-sm text-zinc-600 dark:text-zinc-400 mb-5">
            {t('profile.description')}
          </p>

          {!hasProfile && (
            <div className="mb-5 p-3 border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="font-mono text-xs text-amber-700 dark:text-amber-300">
                {t('profile.usingAutoPB')}
              </p>
            </div>
          )}

          <div className="space-y-4 mb-6">
            {PB_KEYS.map(({ key, labelKey }) => (
              <div key={key}>
                <label className="block font-mono text-xs font-bold uppercase mb-1.5">
                  {t(labelKey)}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder={t('profile.timeFormat')}
                    value={values[key]}
                    onChange={e => handleChange(key, e.target.value)}
                    className={[
                      'w-full px-3 py-2 font-mono text-sm border-4 bg-white dark:bg-zinc-900 outline-none transition-colors',
                      errors[key]
                        ? 'border-red-500 focus:border-red-600'
                        : 'border-zinc-300 dark:border-zinc-600 focus:border-blue-500 dark:focus:border-blue-400',
                    ].join(' ')}
                  />
                  <Clock
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                  />
                </div>
                {errors[key] && (
                  <p className="mt-1 font-mono text-xs text-red-600">
                    {t('common.error')} — {t('profile.timeFormat')}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              {showSaved ? (
                <PixelBadge variant="success">{t('profile.saveSuccess')}</PixelBadge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <PixelButton variant="outline" size="md" onClick={onClose}>
                {t('common.cancel')}
              </PixelButton>
              <PixelButton variant="primary" size="md" onClick={handleSave}>
                {t('common.save')}
              </PixelButton>
            </div>
          </div>
        </div>
      </PixelCard>
    </div>
  );
}
