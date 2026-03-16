import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SPX Signal Desk — Options Intelligence Engine',
  description: 'Institutional-grade SPX options strategy platform with AI-powered analysis, Monte Carlo simulation, and volatility modeling',
  keywords: ['SPX', 'options', 'credit spreads', 'volatility', 'hedge fund', 'trading'],
};

export const viewport = {
  themeColor: '#060b14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%231d4ed8'/><text x='16' y='23' text-anchor='middle' font-size='20' font-weight='bold' fill='white' font-family='sans-serif'>S</text></svg>" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-[#060b14] overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
