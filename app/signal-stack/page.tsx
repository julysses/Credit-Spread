import { Metadata } from 'next';
import { SignalStackEngine } from '@/components/dashboard/SignalStackEngine';

export const metadata: Metadata = {
  title: 'SPX Signal Stack Engine | Macro Directional Intelligence',
  description: 'Institutional-grade SPX options signal stacking framework — Nicholas Crown methodology with AI-powered analysis',
};

export default function SignalStackPage() {
  return <SignalStackEngine />;
}
