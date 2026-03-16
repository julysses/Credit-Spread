import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPX Signal Desk — Options Intelligence Engine',
  description: 'Institutional-grade SPX options strategy platform with AI-powered analysis, Monte Carlo simulation, and volatility modeling',
  keywords: ['SPX', 'options', 'credit spreads', 'volatility', 'hedge fund', 'trading'],
  themeColor: '#060b14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-[#060b14] overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
