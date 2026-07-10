import type { Metadata, Viewport } from 'next';
import { Antonio, Inter, Inter_Tight } from 'next/font/google';
import './globals.css';
import { ThemeBootstrap } from '@/components/theme-bootstrap';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { FavoritesOnboardingModal } from '@/components/favorites/favorites-onboarding-modal';

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

// Without an explicit viewport, mobile browsers assume a ~980px layout width
// and scale the page down (or let it overflow) — which broke scaling across
// phone models and clipped the right-edge controls. width=device-width +
// initial-scale=1 makes the layout viewport match the device. viewport-fit
// cover lets us use env(safe-area-inset-*) on notched phones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F2EC' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A09' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="field" className={`${interTight.variable} ${inter.variable} ${antonio.variable}`}>
      <head>
        <ThemeBootstrap />
      </head>
      <body className="font-sans bg-bg text-ink min-h-screen">
        <AuthProvider>
          {children}
          <FavoritesOnboardingModal />
        </AuthProvider>
      </body>
    </html>
  );
}
