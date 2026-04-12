import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';

const SHARED =
  'w-full bg-surface-card border border-edge rounded-lg px-3.5 text-ink-primary placeholder-ink-muted ' +
  'focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold-ring transition-all duration-200 disabled:opacity-40';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...rest },
  ref
) {
  return <input ref={ref} className={[SHARED, 'h-10 text-sm', className].join(' ')} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = '', ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={[SHARED, 'py-2.5 text-sm min-h-[80px] resize-y leading-relaxed', className].join(' ')}
      {...rest}
    />
  );
});
