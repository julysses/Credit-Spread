import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SignalSnapshot = {
  id?: string;
  created_at?: string;
  wti_price: number;
  wti_4week_change_pct: number;
  spx_price: number;
  spx_200sma: number;
  breadth_pct_above_200sma: number;
  hy_spread_bps: number;
  hy_spread_2week_change: number;
  dxy_level: number;
  vix_level: number;
  gold_price: number;
  gold_weekly_change_pct: number;
  portfolio_vol_annualized: number;
  gex_value: number;
  vvix_level: number;
  pcr_value: number;
  macro_score: number;
  flow_score: number;
  composite_signal: string;
  notes?: string;
  ai_recommendation?: string;
};

export type TradeLog = {
  id?: string;
  created_at?: string;
  signal_snapshot_id: string;
  action_taken: string;
  options_structure: string;
  entry_price: number;
  target_dte: number;
  outcome_notes: string;
};
