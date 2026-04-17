'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from '@/components/ui';

interface GeneratingOverlayProps {
  isOpen: boolean;
  onCancel: () => void;
}

const STEPS_ZH = [
  '分析能力数据...',
  '计算目标配速区间...',
  '设计周期化结构...',
  '编排每日训练内容...',
  '校验跑量与恢复平衡...',
];

const STEPS_EN = [
  'Analyzing ability data...',
  'Calculating target pace zones...',
  'Designing periodization...',
  'Scheduling daily sessions...',
  'Validating volume & recovery...',
];

const TIPS_ZH = [
  'Tip: 轻松跑时你应该能完整说出一句话。',
  'Tip: 睡眠不足时，把强度课推迟一天。',
  'Tip: 每周跑量增加不要超过10%。',
  'Tip: 减量期的休息也是训练的一部分。',
  'Tip: 长距离的后半段比前半段更重要。',
  'Tip: 力量训练能让你在30km后不掉速。',
  'Tip: 比赛前一周不要尝试新装备。',
];

const TIPS_EN = [
  'Tip: Easy runs should be conversational pace.',
  'Tip: Sleep deficit? Delay the hard session.',
  'Tip: Increase weekly volume by no more than 10%.',
  'Tip: Rest during taper is part of the training.',
  'Tip: The second half of a long run matters most.',
  'Tip: Strength work keeps you strong after 30km.',
  'Tip: Never try new gear on race week.',
];

export function GeneratingOverlay({ isOpen, onCancel }: GeneratingOverlayProps) {
  const { i18n } = useTranslation();
  const isZh = i18n.language === 'zh';
  const steps = isZh ? STEPS_ZH : STEPS_EN;
  const tips = isZh ? TIPS_ZH : TIPS_EN;

  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      setStepIndex(0);
      setTipIndex(0);
      return;
    }

    // Simulate progress: fast start, slow middle, crawl near end
    let current = 0;
    const interval = setInterval(() => {
      const remaining = 100 - current;
      let increment = 0;
      if (current < 20) increment = Math.random() * 5 + 2;
      else if (current < 50) increment = Math.random() * 3 + 1;
      else if (current < 80) increment = Math.random() * 2 + 0.5;
      else if (current < 92) increment = Math.random() * 1 + 0.2;
      else increment = 0.05;

      current = Math.min(92, current + increment);
      setProgress(current);
    }, 800);

    return () => clearInterval(interval);
  }, [isOpen]);

  // Complete progress when overlay is about to close (parent will unmount)
  useEffect(() => {
    if (!isOpen) return;
    return () => setProgress(100);
  }, [isOpen]);

  // Rotate steps
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setStepIndex((idx) => (idx + 1) % steps.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isOpen, steps.length]);

  // Rotate tips
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setTipIndex((idx) => (idx + 1) % tips.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [isOpen, tips.length]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Pixel runner animation */}
        <div className="flex justify-center mb-8">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 grid grid-cols-4 grid-rows-4 gap-0.5 animate-pulse">
              {[...Array(16)].map((_, i) => (
                <div
                  key={i}
                  className={[
                    'bg-blue-500',
                    i % 3 === 0 ? 'animate-bounce' : '',
                    i % 5 === 0 ? 'delay-100' : '',
                    i % 7 === 0 ? 'delay-200' : '',
                  ].join(' ')}
                  style={{
                    animationDuration: `${0.8 + (i % 3) * 0.2}s`,
                    opacity: i % 4 === 0 ? 1 : 0.6 + (i % 4) * 0.1,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-pixel text-lg font-bold text-white text-center mb-6">
          {isZh ? 'AI 正在制定训练计划' : 'AI is crafting your plan'}
        </h2>

        {/* Progress bar */}
        <div className="mb-4 border-4 border-zinc-700 bg-zinc-900 p-1">
          <div
            className="h-4 bg-blue-500 transition-all duration-700 ease-out relative"
            style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
          >
            <div className="absolute inset-0 bg-white/20 animate-pulse" />
          </div>
        </div>

        {/* Percentage & Step */}
        <div className="text-center mb-8">
          <p className="font-mono text-2xl font-bold text-white mb-2">
            {Math.round(progress)}%
          </p>
          <p className="font-mono text-sm text-zinc-400 h-5 transition-opacity duration-500">
            {steps[stepIndex]}
          </p>
        </div>

        {/* Tip card */}
        <div className="border-2 border-zinc-700 bg-zinc-900/80 p-4 mb-8 min-h-[80px] flex items-center justify-center">
          <p className="font-mono text-xs text-zinc-300 text-center transition-opacity duration-500">
            {tips[tipIndex]}
          </p>
        </div>

        {/* Cancel button */}
        <div className="flex justify-center">
          <PixelButton variant="outline" onClick={onCancel}>
            {isZh ? '取消生成' : 'Cancel'}
          </PixelButton>
        </div>
      </div>
    </div>
  );
}
