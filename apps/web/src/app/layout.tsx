/**
 * Path: apps/web/src/app/layout.tsx
 * Purpose: Root layout — dark theme shell, font stacks (Inter / JetBrains
 *          Mono via CSS stacks: offline-safe), providers mount.
 * Dependencies: ./globals.css, ./providers
 */
import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Tagent Office',
  description: 'Your AI team, in your browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
