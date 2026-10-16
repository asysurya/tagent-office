/**
 * Path: apps/landing/src/app/layout.tsx
 * Purpose: Landing root layout (Phase 11 stub).
 * Dependencies: ./globals.css
 */
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tagent Office',
  description: 'Your AI team, in your browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
