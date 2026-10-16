/**
 * Path: apps/web/src/app/providers.tsx
 * Purpose: Client providers — TanStack Query + the one-time socket bootstrap
 *          (connection, snapshot handshake, event invalidations).
 * Dependencies: @tanstack/react-query, @/lib/socket
 */
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { connectOfficeSocket } from '@/lib/socket';

/** App-wide providers. */
export function Providers({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 1_000, retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  useEffect(() => {
    connectOfficeSocket(queryClient);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
