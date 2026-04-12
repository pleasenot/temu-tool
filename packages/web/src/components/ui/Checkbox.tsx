import { InputHTMLAttributes, forwardRef } from 'react';
import { Check } from 'lucide-react';

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, className = '', ...rest },
  ref
) {
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        className="appearance-none w-4 h-4 rounded border border-edge bg-surface-card checked:bg-gold checked:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-ring transition-all duration-200 cursor-pointer"
        {...rest}
      />
      {checked && (
        <Check
          size={12}
          strokeWidth={3}
          className="absolute pointer-events-none text-surface-base"
        />
      )}
    </span>
  );
});
