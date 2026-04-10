-- Migration: Institutional Pre-Trade Positioning Intelligence Module
-- Adds daily_signals, session_plans, and overnight_checks tables

CREATE TABLE IF NOT EXISTS daily_signals (
  id serial PRIMARY KEY,
  signal_date varchar(20) NOT NULL UNIQUE,
  spx_close real,
  spx_vs_200sma real,
  vix_close real,
  vvix_close real,
  vix_9d real,
  vix_30 real,
  vix_term_structure varchar(30),
  gex_net real,
  gamma_flip_level real,
  call_wall real,
  put_wall real,
  dark_pool_bias varchar(20),
  dark_pool_call_pct real,
  ad_ratio real,
  pct_above_200sma real,
  catalyst_risk boolean DEFAULT false,
  catalyst_detail text,
  tier_score integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_signals_date_idx ON daily_signals (signal_date);

CREATE TABLE IF NOT EXISTS session_plans (
  id serial PRIMARY KEY,
  plan_date varchar(20) NOT NULL,
  signal_id integer REFERENCES daily_signals(id),
  regime_tier integer,
  strategy text,
  strikes text,
  dte integer,
  position_size_pct real,
  entry_conditions text,
  exit_rules text,
  claude_raw_output text,
  applied_rules jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_plans_date_idx ON session_plans (plan_date);

CREATE TABLE IF NOT EXISTS overnight_checks (
  id serial PRIMARY KEY,
  check_date varchar(20) NOT NULL,
  es_overnight_high real,
  es_overnight_low real,
  es_current_price real,
  nq_overnight_high real,
  nq_overnight_low real,
  gap_vs_prior_close real,
  gap_pct real,
  overnight_type varchar(30),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS overnight_checks_date_idx ON overnight_checks (check_date);
