import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

export function getChangeColor(value: number): string {
  if (value > 0) return 'text-green-400';
  if (value < 0) return 'text-red-400';
  return 'text-gray-400';
}

export function getBgChangeColor(value: number): string {
  if (value > 0) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (value < 0) return 'bg-red-500/20 text-red-400 border-red-500/30';
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'low': return 'text-green-400';
    case 'moderate': return 'text-yellow-400';
    case 'elevated': return 'text-orange-400';
    case 'high': return 'text-red-400';
    case 'extreme': return 'text-red-600';
    default: return 'text-gray-400';
  }
}

export function getRiskBadgeClass(level: string): string {
  switch (level) {
    case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'moderate': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'elevated': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'extreme': return 'bg-red-700/20 text-red-500 border-red-700/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

export function getConfidenceColor(confidence: string): string {
  switch (confidence) {
    case 'high': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'low': return 'text-red-400';
    default: return 'text-gray-400';
  }
}

export function strategyLabel(strategy: string): string {
  switch (strategy) {
    case '90_PERCENT_FRAMEWORK': return '90% Win-Rate Framework';
    case 'MODERN_INCOME': return 'Modern SPX Income';
    case 'VOLATILITY_CRUSH': return 'Volatility Crush';
    case 'NO_TRADE': return 'No Trade';
    default: return strategy;
  }
}

export function formatDTE(days: number): string {
  if (days === 0) return 'Intraday';
  if (days === 1) return '1 DTE';
  return `${days} DTE`;
}
