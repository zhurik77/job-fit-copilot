import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-ink-deep shadow-[0_0_0_1px_rgba(255,149,0,0.4),0_8px_30px_-8px_rgba(255,149,0,0.7)] hover:brightness-110 active:scale-[0.98]',
        outline: 'border border-line text-fg hover:border-fg/40 hover:bg-white/5 active:scale-[0.98]',
        ghost: 'text-fg-muted hover:text-fg hover:bg-white/5',
      },
      size: {
        default: 'h-11 px-6',
        sm: 'h-9 px-4 text-[0.8125rem]',
        lg: 'h-13 px-8 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  }
);

export function Button({ className, variant, size, asChild, ...props }) {
  const Comp = asChild ? 'a' : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
