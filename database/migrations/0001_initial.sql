-- SPX Signal Desk Initial Migration
-- Run with: psql $DATABASE_URL -f migrations/0001_initial.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  phone VARCHAR(20),
  account_size REAL DEFAULT 100000,
  risk_per_trade REAL DEFAULT 0.02,
  notify_email BOOLEAN DEFAULT TRUE,
  notify_sms BOOLEAN DEFAULT FALSE,
  notify_push BOOLEAN DEFAULT TRUE,
  timezone VARCHAR(50) DEFAULT 'America/New_York',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
  spx_price REAL NOT NULL,
  spy_price REAL,
  vix REAL NOT NULL,
  vix_regime VARCHAR(20),
  iv_rank REAL,
  iv_percentile REAL,
  implied_vol REAL,
  realized_vol REAL,
  spx_daily_change REAL,
  spx_daily_change_pct REAL,
  directional_bias VARCHAR(20),
  market_regime VARCHAR(30),
  risk_level VARCHAR(20),
  is_macro_event_day BOOLEAN DEFAULT FALSE,
  macro_event_type VARCHAR(50),
  expected_move REAL,
  atm_straddle REAL,
  skew_data JSONB,
  term_structure JSONB,
  technical_signal VARCHAR(30),
  raw_data JSONB
);
CREATE INDEX IF NOT EXISTS market_snapshots_ts_idx ON market_snapshots(timestamp);

CREATE TABLE IF NOT EXISTS news_events (
  id SERIAL PRIMARY KEY,
  published_at TIMESTAMP NOT NULL,
  source VARCHAR(100),
  headline TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  sentiment VARCHAR(20),
  sentiment_score REAL,
  geopolitical_risk BOOLEAN DEFAULT FALSE,
  macro_relevance BOOLEAN DEFAULT FALSE,
  risk_impact VARCHAR(20),
  ai_analysis TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS news_published_idx ON news_events(published_at);

CREATE TABLE IF NOT EXISTS strategy_recommendations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  generated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  strategy VARCHAR(50) NOT NULL,
  trade_type VARCHAR(50),
  spx_price REAL NOT NULL,
  vix REAL NOT NULL,
  market_regime VARCHAR(30),
  risk_level VARCHAR(20),
  confidence VARCHAR(10),
  short_strike INTEGER,
  short_option_type VARCHAR(10),
  short_delta REAL,
  short_iv REAL,
  short_premium REAL,
  long_strike INTEGER,
  long_option_type VARCHAR(10),
  long_delta REAL,
  long_iv REAL,
  long_premium REAL,
  short_strike_2 INTEGER,
  long_strike_2 INTEGER,
  credit REAL,
  credit_total REAL,
  max_profit REAL,
  max_loss REAL,
  spread_width INTEGER,
  prob_of_profit REAL,
  prob_of_touch REAL,
  expected_value REAL,
  kelly_size REAL,
  profit_target REAL,
  stop_loss REAL,
  days_to_expiry INTEGER,
  expiry_date VARCHAR(20),
  rationale JSONB,
  conditions JSONB,
  warnings JSONB,
  morning_brief TEXT,
  mc_results JSONB,
  status VARCHAR(20) DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS strat_rec_generated_idx ON strategy_recommendations(generated_at);

CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  recommendation_id INTEGER REFERENCES strategy_recommendations(id),
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  expiry_date VARCHAR(20),
  strategy VARCHAR(50) NOT NULL,
  trade_type VARCHAR(50),
  short_strike INTEGER NOT NULL,
  long_strike INTEGER NOT NULL,
  short_strike_2 INTEGER,
  long_strike_2 INTEGER,
  option_type VARCHAR(10),
  contracts INTEGER DEFAULT 1,
  open_credit REAL NOT NULL,
  close_debit REAL,
  pnl REAL,
  pnl_percent REAL,
  status VARCHAR(20) DEFAULT 'open',
  close_reason VARCHAR(50),
  max_adverse_excursion REAL,
  max_favorable_excursion REAL,
  notes TEXT,
  tags JSONB
);
CREATE INDEX IF NOT EXISTS trades_user_idx ON trades(user_id);
CREATE INDEX IF NOT EXISTS trades_status_idx ON trades(status);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(10) DEFAULT 'normal',
  channel VARCHAR(20) NOT NULL,
  delivered BOOLEAN DEFAULT FALSE,
  related_trade_id INTEGER REFERENCES trades(id),
  related_recommendation_id INTEGER REFERENCES strategy_recommendations(id),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS economic_calendar (
  id SERIAL PRIMARY KEY,
  event_date TIMESTAMP NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  importance VARCHAR(10) DEFAULT 'medium',
  forecast VARCHAR(50),
  previous VARCHAR(50),
  actual VARCHAR(50),
  is_macro_event_day BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS eco_calendar_date_idx ON economic_calendar(event_date);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  calculated_at TIMESTAMP DEFAULT NOW(),
  period VARCHAR(20),
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  losing_trades INTEGER DEFAULT 0,
  win_rate REAL,
  avg_win REAL,
  avg_loss REAL,
  profit_factor REAL,
  total_pnl REAL,
  max_drawdown REAL,
  sharpe_ratio REAL,
  expected_value_accuracy REAL,
  by_strategy JSONB,
  by_regime JSONB
);

CREATE TABLE IF NOT EXISTS morning_briefings (
  id SERIAL PRIMARY KEY,
  date VARCHAR(20) NOT NULL UNIQUE,
  generated_at TIMESTAMP DEFAULT NOW(),
  market_summary TEXT,
  geopolitical_risk TEXT,
  macro_analysis TEXT,
  technical_analysis TEXT,
  strategy_recommendation TEXT,
  risk_level VARCHAR(20),
  should_trade BOOLEAN DEFAULT TRUE,
  key_events JSONB,
  news_highlights JSONB,
  full_brief TEXT
);
