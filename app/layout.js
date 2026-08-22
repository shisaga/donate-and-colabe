import './globals.css';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'Donate & Colab — List. Pay for #1. Get donations.',
  description: 'List your Instagram ID, app or startup. Pay to rank #1 or let fans donate from ₹1. 30% back to creators, 40% to people in need.',
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
      </body>
    </html>
  );
}
