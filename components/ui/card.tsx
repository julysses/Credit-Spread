import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}

export function Card({ children, className, ...rest }: CardProps) {
  return (
    <div
      className={cn('bg-sd-card border border-sd-line rounded-xl overflow-hidden', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-5 py-3.5 border-b border-sd-line/70 flex items-center justify-between', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className }: CardProps) {
  return (
    <h3 className={cn('text-[11px] font-semibold text-gray-300 uppercase tracking-[0.14em]', className)}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className }: CardProps) {
  return (
    <div className={cn('px-5 py-4', className)}>
      {children}
    </div>
  );
}
