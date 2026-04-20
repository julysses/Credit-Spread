import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'accent';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-800/60 text-gray-300 border-gray-700/70',
  success: 'bg-green-500/12 text-green-400 border-green-500/30',
  warning: 'bg-yellow-500/12 text-yellow-400 border-yellow-500/30',
  danger:  'bg-red-500/12 text-red-400 border-red-500/30',
  info:    'bg-blue-500/12 text-blue-400 border-blue-500/30',
  outline: 'bg-transparent text-gray-400 border-gray-700',
  accent:  'bg-sd-accent-soft text-sd-accent border-sd-accent-soft',
};

export function Badge({ children, className, variant = 'default' }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border',
      variants[variant],
      className,
    )}>
      {children}
    </span>
  );
}
