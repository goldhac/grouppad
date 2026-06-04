import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold leading-none cursor-pointer ' +
    'border border-transparent transition-colors duration-150 ease-standard ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
    'disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        // neutral secondary
        default:
          'bg-surface-raised text-text border-border-strong shadow-xs hover:bg-surface-inset',
        primary:
          'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover active:bg-accent-active active:translate-y-px',
        ghost: 'bg-transparent text-text border-border-strong hover:bg-surface-inset',
        danger: 'bg-transparent text-danger border-danger-border hover:bg-danger-bg',
        link: 'border-0 text-link underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-9 px-3.5 text-[13px] rounded-sm',
        md: 'h-11 px-4 text-sm rounded-md',
        lg: 'h-[52px] px-6 text-base rounded-md',
        icon: 'h-9 w-9 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
