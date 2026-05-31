import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'gold' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variants = {
  primary: 'bg-[#1a3a2a] text-white hover:bg-[#2d5a3d] disabled:opacity-50',
  gold: 'bg-[#b8973a] text-white hover:bg-[#a07e2d] disabled:opacity-50',
  ghost: 'bg-transparent text-[#1a3a2a] border border-[#1a3a2a] hover:bg-[#1a3a2a]/10',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
)

Button.displayName = 'Button'
