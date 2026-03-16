'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Trade {
  id: number;
  openedAt: string;
  strategy: string;
  tradeType: string;
  shortStrike: number;
  longStrike: number;
  shortStrike2?: number;
  longStrike2?: number;
  contracts: number;
  openCredit: number;
  closeDebit?: number;
  pnl: number | null;
  pnlPercent?: number;
  status: string;
  closeReason?: string;
  expiryDate: string;
}

interface TradeJournalProps {
  trades: Trade[];
  summary: {
    openTrades: number;
    closedTrades: number;
    totalPnl: number;
    winRate: number;
    openExposure: number;
  };
}

export function TradeJournal({ trades, summary }: TradeJournalProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Trade Journal</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">{summary.openTrades} open · {summary.closedTrades} closed</span>
            <span className={`font-bold font-mono ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${summary.totalPnl.toFixed(0)} total P&L
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Win Rate</div>
            <div className="text-lg font-bold text-green-400">{(summary.winRate * 100).toFixed(0)}%</div>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Total P&L</div>
            <div className={`text-lg font-bold font-mono ${summary.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${summary.totalPnl.toFixed(0)}
            </div>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Exposure</div>
            <div className="text-lg font-bold text-blue-400">${summary.openExposure.toFixed(0)}</div>
          </div>
        </div>

        {/* Trade Rows */}
        <div className="space-y-2">
          {trades.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </div>

        {trades.length === 0 && (
          <div className="text-center text-gray-600 py-8 text-sm">No trades yet</div>
        )}
      </CardContent>
    </Card>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isOpen = trade.status === 'open';
  const pnlColor = (trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400';

  const spreadLabel = trade.shortStrike2
    ? `${trade.shortStrike}/${trade.longStrike} | ${trade.shortStrike2}/${trade.longStrike2}`
    : `${trade.shortStrike}/${trade.longStrike}`;

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-800/30 rounded-lg hover:bg-gray-800/50 transition-colors">
      <div className="flex items-center gap-3">
        <Badge variant={isOpen ? 'info' : (trade.pnl || 0) >= 0 ? 'success' : 'danger'}>
          {isOpen ? 'OPEN' : (trade.pnl || 0) >= 0 ? 'WIN' : 'LOSS'}
        </Badge>
        <div>
          <div className="text-xs text-gray-300 font-medium">{trade.strategy.replace(/_/g, ' ')}</div>
          <div className="text-xs text-gray-500 font-mono">{spreadLabel}</div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-right">
        <div>
          <div className="text-xs text-gray-500">Credit</div>
          <div className="text-sm font-mono text-white">${trade.openCredit.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">P&L</div>
          <div className={`text-sm font-mono font-bold ${isOpen ? 'text-gray-400' : pnlColor}`}>
            {isOpen ? '--' : `$${(trade.pnl || 0).toFixed(0)}`}
          </div>
        </div>
        <div className="hidden sm:block">
          <div className="text-xs text-gray-500">Exp</div>
          <div className="text-xs text-gray-400">{trade.expiryDate}</div>
        </div>
      </div>
    </div>
  );
}
