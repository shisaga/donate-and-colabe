import './globals.css';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Pay To Trend — Add your profile. Pay to rank. Never ends.',
  description: 'Add your Instagram or other profile, pay to rank higher, and let fans search and donate to boost you. Ranking is always live — there is no contest end date. We sell visibility on PayToTrend, not followers or likes.',
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
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
