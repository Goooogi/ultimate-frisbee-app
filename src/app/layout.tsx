import type { Metadata } from 'next';
import { Antonio, Inter, Inter_Tight } from 'next/font/google';
import './globals.css';
import { ThemeBootstrap } from '@/components/theme-bootstrap';

const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-tight',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const antonio = Antonio({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Layout · Ultimate Frisbee',
  description: 'Live Ultimate Frisbee scores from the UFA, USAU Club, and International ultimate.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="field" className={`${interTight.variable} ${inter.variable} ${antonio.variable}`}>
      <head>
        <ThemeBootstrap />
      </head>
      <body className="font-sans bg-bg text-ink min-h-screen">{children}</body>
    </html>
  );
}
