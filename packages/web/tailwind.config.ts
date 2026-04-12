import type { Config } from 'tailwindcss';

/**
 * All design tokens are defined as CSS vars in src/styles/globals.css.
 * Tailwind classes here are thin aliases — change vars to retheme.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base: 'var(--bg-base)',
          raised: 'var(--bg-raised)',
          card: 'var(--bg-card)',
          hover: 'var(--bg-hover)',
          elevated: 'var(--bg-elevated)',
        },
        ink: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        edge: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        gold: {
          DEFAULT: 'var(--accent-gold)',
          soft: 'var(--accent-gold-soft)',
          ring: 'var(--accent-gold-ring)',
        },
        violet: {
          accent: 'var(--accent-violet)',
        },
        status: {
          success: 'var(--status-success)',
          warn: 'var(--status-warn)',
          danger: 'var(--status-danger)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body: ['var(--font-body)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        'glow-gold': 'var(--shadow-glow-gold)',
        card: 'var(--shadow-card)',
        modal: 'var(--shadow-modal)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
