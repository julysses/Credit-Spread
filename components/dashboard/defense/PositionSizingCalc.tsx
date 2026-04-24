'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { calcPositionSize } from '@/lib/models/defense-engine';

export function PositionSizingCalc() {
  const [inputs, setInputs] = useState({
    accountSize:  '100000',
    riskPct:      '2',
    maxLoss:      '450',
    winRate:      '68',
  });

  const accountSize = parseFloat(inputs.accountSize) || 100000;
  const riskPct     = (parseFloat(inputs.riskPct) || 2) / 100;
  const maxLoss     = parseFloat(inputs.maxLoss) || 450;
  const winRate     = (parseFloat(inputs.winRate) || 68) / 100;

  const result = calcPositionSize(accountSize, riskPct, maxLoss, winRate);

  function Field({ label, field, suffix }: { label: string; field: keyof typeof inputs; suffix?: string }) {
    return (
      <div>
        <label className="text-[9px] text-gray-500 uppercase tracking-[0.14em] block mb-1">{label}</label>
        <div className="relative">
          <input
            type="number"
            value={inputs[field]}
            onChange={e => setInputs(p => ({ ...p, [field]: e.target.value }))}
            className="w-full bg-sd-muted border border-sd-line rounded px-2 py-1.5 text-[12px] text-gray-100 focus:outline-none focus:border-sd-accent"
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{suffix}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Position Sizing</CardTitle>
        <span className="text-[9px] text-gray-500 border border-sd-line rounded px-1.5 py-0.5 uppercase tracking-[0.1em]">
          Kelly + Fixed Risk
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account Size"  field="accountSize"  suffix="$" />
          <Field label="Risk Per Trade" field="riskPct"      suffix="%" />
          <Field label="Max Loss / Contract" field="maxLoss" suffix="$" />
          <Field label="Win Rate"       field="winRate"      suffix="%" />
        </div>

        <div className="pt-2 border-t border-sd-line/40 grid grid-cols-2 gap-3">
          <div className="bg-sd-muted/50 border border-sd-line/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1">Fixed Risk Contracts</div>
            <div className="slab text-2xl tabular-nums text-gray-100">{result.contracts}</div>
            <div className="text-[10px] text-gray-500 mt-1">${result.dollarRisk.toLocaleString()} at risk</div>
          </div>
          <div className="bg-sd-muted/50 border border-sd-line/60 rounded-lg p-3 text-center">
            <div className="text-[9px] text-gray-500 uppercase tracking-[0.14em] mb-1">½-Kelly Contracts</div>
            <div className="slab text-2xl tabular-nums text-sd-accent">{result.kellySuggestion}</div>
            <div className="text-[10px] text-gray-500 mt-1">optimal sizing</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-center text-[10px]">
          <div className="bg-sd-muted/30 rounded border border-sd-line/40 py-2 px-3">
            <div className="text-gray-500 uppercase tracking-[0.1em] mb-0.5">% of Account</div>
            <div className={`font-mono tabular-nums ${result.pctOfAccount > 0.05 ? 'text-orange-400' : 'text-gray-200'}`}>
              {(result.pctOfAccount * 100).toFixed(2)}%
            </div>
          </div>
          <div className="bg-sd-muted/30 rounded border border-sd-line/40 py-2 px-3">
            <div className="text-gray-500 uppercase tracking-[0.1em] mb-0.5">Dollar Risk</div>
            <div className="font-mono tabular-nums text-gray-200">
              ${result.dollarRisk.toLocaleString()}
            </div>
          </div>
        </div>

        {result.pctOfAccount > 0.05 && (
          <div className="text-[10px] text-orange-400 border border-orange-500/20 bg-orange-500/10 rounded px-3 py-2">
            Risk exceeds 5% of account — consider reducing contracts.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
