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
      // Written as rgb triplets with <alpha-value> rather than plain
      // var(--x). Tailwind can only synthesise opacity variants (bg-panel/95,
      // ring-ember/70) when it can see the channels; a bare CSS variable is an
      // opaque string to it and those utilities fail to compile.
      //
      // The cost is that colours are declared in two places: here for Tailwind
      // classes, and as CSS variables in theme.css for rules that use
      // var(--ember) directly. Change a colour and both need updating.
      colors: {
        void: 'rgb(13 16 20 / <alpha-value>)',
        panel: 'rgb(20 24 31 / <alpha-value>)',
        raised: 'rgb(27 33 42 / <alpha-value>)',
        hover: 'rgb(34 42 53 / <alpha-value>)',
        line: 'rgb(38 46 58 / <alpha-value>)',
        'line-strong': 'rgb(53 64 79 / <alpha-value>)',

        ink: {
          DEFAULT: 'rgb(233 238 245 / <alpha-value>)',
          soft: 'rgb(151 163 179 / <alpha-value>)',
          faint: 'rgb(95 107 122 / <alpha-value>)',
        },

        ember: {
          DEFAULT: 'rgb(245 165 36 / <alpha-value>)',
          soft: 'var(--ember-soft)',
          deep: 'rgb(185 118 26 / <alpha-value>)',
        },
        mint: { DEFAULT: 'rgb(61 214 140 / <alpha-value>)', soft: 'var(--mint-soft)' },
        chili: { DEFAULT: 'rgb(242 85 90 / <alpha-value>)', soft: 'var(--chili-soft)' },
        sky: { DEFAULT: 'rgb(91 156 255 / <alpha-value>)', soft: 'var(--sky-soft)' },
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
