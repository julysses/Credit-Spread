import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Demo analytics data
  const analytics = {
    summary: {
      totalTrades: 47,
      winningTrades: 42,
      losingTrades: 5,
      winRate: 0.894,
      avgWin: 68.50,
      avgLoss: -412.00,
      profitFactor: 3.12,
      totalPnl: 2877,
      maxDrawdown: -412,
      sharpeRatio: 2.34,
    },
    byStrategy: [
      { strategy: '90_PERCENT_FRAMEWORK', trades: 28, winRate: 0.929, pnl: 1890 },
      { strategy: 'MODERN_INCOME', trades: 14, winRate: 0.857, pnl: 845 },
      { strategy: 'VOLATILITY_CRUSH', trades: 5, winRate: 0.800, pnl: 142 },
    ],
    byRegime: [
      { regime: 'low', trades: 12, winRate: 0.917, pnl: 840 },
      { regime: 'moderate', trades: 20, winRate: 0.900, pnl: 1240 },
      { regime: 'elevated', trades: 10, winRate: 0.870, pnl: 620 },
      { regime: 'high', trades: 5, winRate: 0.800, pnl: 177 },
    ],
    monthlyPnl: [
      { month: 'Oct', pnl: 420 },
      { month: 'Nov', pnl: 685 },
      { month: 'Dec', pnl: 512 },
      { month: 'Jan', pnl: 390 },
      { month: 'Feb', pnl: 480 },
      { month: 'Mar', pnl: 390 },
    ],
    recentTrades: [
      { date: '2026-03-14', strategy: 'MODERN_INCOME', type: 'Put Spread', strike: '5650/5640', credit: 1.45, result: 'WIN', pnl: 72.50 },
      { date: '2026-03-11', strategy: '90%_FRAMEWORK', type: 'Iron Condor', strike: '5600/5590 | 5900/5910', credit: 2.10, result: 'WIN', pnl: 105 },
      { date: '2026-03-07', strategy: '90%_FRAMEWORK', type: 'Put Spread', strike: '5700/5690', credit: 0.95, result: 'WIN', pnl: 47.50 },
      { date: '2026-03-04', strategy: 'VOLATILITY_CRUSH', type: 'Put Spread', strike: '5760/5755', credit: 0.75, result: 'WIN', pnl: 37.50 },
      { date: '2026-02-28', strategy: 'MODERN_INCOME', type: 'Call Spread', strike: '5950/5960', credit: 1.20, result: 'LOSS', pnl: -412 },
    ],
    evAccuracy: {
      predicted: 68.50,
      actual: 65.20,
      accuracy: 95.2,
    },
  };

  return NextResponse.json({ success: true, data: analytics });
}
