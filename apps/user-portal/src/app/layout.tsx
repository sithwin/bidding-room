import type { Metadata } from 'next';
import { Bodoni_Moda, Mulish } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

const bodoni = Bodoni_Moda({
  subsets: ['latin'],
  axes: ['opsz'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bodoni',
  display: 'swap',
});

const mulish = Mulish({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-mulish',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Carat Room — Fine Auction House',
  description: 'Bid with confidence on the finest collections in Australia.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' className={`${bodoni.variable} ${mulish.variable}`}>
      <body>
        <AuthProvider>
          <div className='pb-16 md:pb-0'>{children}</div>
          <MobileBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
