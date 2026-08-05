import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.1em]',
  {
    variants: {
      variant: {
        default: 'border-line bg-white/5 text-fg-muted',
        accent: 'border-accent/40 bg-accent/10 text-accent',
        good: 'border-good/40 bg-good/10 text-good',
        bad: 'border-bad/40 bg-bad/10 text-bad',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
