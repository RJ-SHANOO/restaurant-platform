/** @type {import('tailwindcss').Config} */

/*
 * Design direction: "Service Line".
 *
 * The palette comes from a working kitchen at night - charcoal steel surfaces,
 * a saffron flame as the only warm light, and two signal colours that mean
 * exactly one thing each: mint for ready/paid, chilli for overdue/voided.
 *
 * Every colour is declared as a CSS variable in styles/theme.css so a
 * restaurant's own brand colour can be swapped in at runtime for its public
 * website without rebuilding the app.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colours are declared as "R G B" CSS variables in theme.css - a light
      // set on :root and a dark set on [data-theme='dark'] - so switching the
      // theme toggle repaints every one of these classes with no rebuild.
      // rgb(var(--x) / <alpha-value>) is what lets Tailwind still synthesise
      // opacity variants (bg-panel/95, ring-ember/70) against a variable.
      colors: {
        void: 'rgb(var(--c-void) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        raised: 'rgb(var(--c-raised) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--c-line-strong) / <alpha-value>)',

        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
        },

        ember: {
          DEFAULT: 'rgb(var(--c-ember) / <alpha-value>)',
          soft: 'var(--ember-soft)',
          deep: 'rgb(var(--c-ember-deep) / <alpha-value>)',
        },
        mint: { DEFAULT: 'rgb(var(--c-mint) / <alpha-value>)', soft: 'var(--mint-soft)' },
        chili: { DEFAULT: 'rgb(var(--c-chili) / <alpha-value>)', soft: 'var(--chili-soft)' },
        sky: { DEFAULT: 'rgb(var(--c-sky) / <alpha-value>)', soft: 'var(--sky-soft)' },
      },

      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        data: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        'display-lg': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.035em', fontWeight: '600' }],
        'display-md': ['1.875rem', { lineHeight: '1.15', letterSpacing: '-0.03em', fontWeight: '600' }],
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.16em', fontWeight: '600' }],
      },

      borderRadius: { card: '14px', control: '10px', pill: '999px' },

      boxShadow: {
        panel: '0 1px 0 0 var(--line), 0 12px 32px -18px rgba(0,0,0,.9)',
        lifted: '0 20px 48px -24px rgba(0,0,0,.95)',
        'ember-glow': '0 0 0 1px var(--ember-soft), 0 0 28px -6px rgba(245,165,36,.35)',
      },

      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(24px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'ember-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(245,165,36,.45)' },
          '50%': { opacity: '.85', boxShadow: '0 0 0 7px rgba(245,165,36,0)' },
        },
        'ticket-print': {
          from: { opacity: '0', transform: 'translateY(-14px) scaleY(.94)', transformOrigin: 'top' },
          to: { opacity: '1', transform: 'translateY(0) scaleY(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '-500px 0' },
          to: { backgroundPosition: '500px 0' },
        },
      },

      animation: {
        'rise-in': 'rise-in .45s cubic-bezier(.2,.7,.3,1) both',
        'slide-in-right': 'slide-in-right .4s cubic-bezier(.2,.7,.3,1) both',
        'ember-pulse': 'ember-pulse 2.2s ease-in-out infinite',
        'ticket-print': 'ticket-print .38s cubic-bezier(.2,.8,.3,1) both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
