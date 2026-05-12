import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Runner Archive | wenkangzhou',
  description: 'Personal running data visualization — no login required.',
};

export default function MeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
