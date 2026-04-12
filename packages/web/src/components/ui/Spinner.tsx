export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-gold border-r-transparent animate-spin ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="加载中"
    />
  );
}
