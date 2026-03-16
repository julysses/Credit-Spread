/**
 * Alert System Worker
 * Handles SMS, Email, and Push notifications
 */

import axios from 'axios';

export interface Alert {
  type: 'morning_brief' | 'signal' | 'warning' | 'stop_hit' | 'profit_target';
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  channel: 'sms' | 'email' | 'push';
  phone?: string;
  email?: string;
}

/**
 * Send SMS via Twilio
 */
export async function sendSMS(to: string, message: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_FROM;

  if (!sid || !token || !from) {
    console.log('[SMS] Twilio not configured — would send:', { to, message });
    return false;
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      new URLSearchParams({ To: to, From: from, Body: message }),
      {
        auth: { username: sid, password: token },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );
    console.log('[SMS] Sent to', to);
    return true;
  } catch (err) {
    console.error('[SMS] Failed:', err);
    return false;
  }
}

/**
 * Send Email via SendGrid
 */
export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const key = process.env.SENDGRID_API_KEY;

  if (!key) {
    console.log('[Email] SendGrid not configured — would send:', { to, subject });
    return false;
  }

  try {
    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{ to: [{ email: to }], subject }],
        from: { email: 'alerts@spxsignaldesk.com', name: 'SPX Signal Desk' },
        content: [{ type: 'text/plain', value: body }],
      },
      {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      }
    );
    console.log('[Email] Sent to', to);
    return true;
  } catch (err) {
    console.error('[Email] Failed:', err);
    return false;
  }
}

/**
 * Format trade alert message
 */
export function formatTradeAlert(
  strategy: string,
  tradeType: string,
  shortStrike: number,
  longStrike: number,
  credit: number,
  pop: number,
  ev: number
): string {
  return `
SPX SIGNAL DESK ALERT
${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET

Strategy: ${strategy.replace(/_/g, ' ')}
Trade: ${tradeType.replace(/_/g, ' ').toUpperCase()}
Short: ${shortStrike} | Long: ${longStrike}
Credit: $${credit.toFixed(2)} per spread
POP: ${(pop * 100).toFixed(1)}%
EV: $${ev.toFixed(2)}

Rules:
✓ Take profit: $${(credit * 0.5).toFixed(2)} (50%)
✗ Stop loss: $${(credit * 2.2).toFixed(2)} (2.2×)

— SPX Signal Desk
`.trim();
}

/**
 * Format morning brief alert
 */
export function formatMorningBriefAlert(
  spxPrice: number,
  vix: number,
  strategy: string,
  riskLevel: string,
  executiveSummary: string
): string {
  return `
SPX SIGNAL DESK — Morning Brief
${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

SPX: ${spxPrice.toFixed(0)} | VIX: ${vix.toFixed(1)}
Risk: ${riskLevel.toUpperCase()}
Strategy: ${strategy.replace(/_/g, ' ')}

${executiveSummary}

— SPX Signal Desk
`.trim();
}

/**
 * Dispatch alert to appropriate channel
 */
export async function dispatchAlert(alert: Alert): Promise<void> {
  console.log(`[Alert] ${alert.type}: ${alert.title}`);

  if (alert.channel === 'sms' && alert.phone) {
    await sendSMS(alert.phone, `${alert.title}\n\n${alert.message}`);
  } else if (alert.channel === 'email' && alert.email) {
    await sendEmail(alert.email, alert.title, alert.message);
  } else {
    // Push notification would go here (web push API)
    console.log('[Push]', alert.title);
  }
}
