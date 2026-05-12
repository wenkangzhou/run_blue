'use client';

import React from 'react';

export function RadarScan() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      <div
        className="absolute left-0 right-0 h-px bg-green-400/10"
        style={{
          animation: 'radarScan 4s linear infinite',
          boxShadow: '0 0 8px rgba(74, 222, 128, 0.2)',
        }}
      />
      <style jsx>{`
        @keyframes radarScan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
