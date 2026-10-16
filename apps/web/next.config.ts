/**
 * Path: apps/web/next.config.ts
 * Purpose: Next.js config. transpilePackages pulls the shared workspace
 *          types in as source. The rewrites implement SAME-ORIGIN proxy
 *          mode: useful when the GUI and the daemon are served from one
 *          origin (embedded binary, reverse proxy, hosted preview).
 *          Default mode stays DIRECT: the browser talks to
 *          http://localhost:4020 with the standard /socket.io path
 *          (anti-pattern #1) — set NEXT_PUBLIC_DAEMON_URL="" to switch.
 * Dependencies: next
 */
import type { NextConfig } from 'next';

/** Where the same-origin proxy forwards to. Server-side only. */
const DAEMON_PROXY_TARGET = process.env['DAEMON_PROXY_TARGET'] ?? 'http://127.0.0.1:4020';

const nextConfig: NextConfig = {
  transpilePackages: ['@tagent-office/shared'],
  async rewrites() {
    return [
      { source: '/api/tagent/:path*', destination: `${DAEMON_PROXY_TARGET}/api/:path*` },
      { source: '/tagent-socket/:path*', destination: `${DAEMON_PROXY_TARGET}/socket.io/:path*` },
    ];
  },
};

export default nextConfig;
