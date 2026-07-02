import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '../lib/theme';
import { themeVarsCss, responsiveCss, noFlashScript } from '../lib/theme-css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Era',
  description: 'Your virtual wardrobe.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Token-generated theme variables + responsive rules. */}
        <style dangerouslySetInnerHTML={{ __html: `${themeVarsCss}\n${responsiveCss}` }} />
        {/* Sets data-theme before first paint so there is no light/dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
