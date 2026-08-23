import './globals.css';
import { Analytics } from '@vercel/analytics/react';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Pay To Trend — Compete. Climb. Get Discovered.',
  description: 'PayToTrend is a competitive paid-discovery platform. List your social profile, fight for #1 on the public leaderboard, and get discovered. We sell visibility on PayToTrend — not followers or likes.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors />
        <Analytics />
      </body>
    </html>
  );
}
