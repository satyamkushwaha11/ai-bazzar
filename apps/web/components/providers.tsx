'use client';
import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { TRPCProvider } from '@/lib/trpc/Provider';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <TRPCProvider>
          {children}
          <Toaster richColors position="top-center" />
        </TRPCProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
