import colors from 'tailwindcss/colors';

// Dark-mode neutral ramp: a cool grey, one third of the way from Tailwind's
// `zinc` to `slate`. Tried and rejected next to the gold accent: `stone` and
// anything between stone and `neutral` read as brown (even near-neutral greys
// pick up the orange); `zinc` was close but still not cool enough; the
// original `slate` read as blue. To retune the dark theme, change these
// values - cooler is toward `slate`, flatter is toward `zinc`.
const DUSK = {
  50: '#f9fafb',
  100: '#f3f4f6',
  200: '#e3e5ea',
  300: '#d1d4db',
  400: '#9da2af',
  500: '#6d7280',
  600: '#4e5360',
  700: '#3b404b',
  800: '#242830',
  900: '#151820',
  950: '#0b0d12',
};

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Crimson Pro', 'serif'],
        'body': ['Manrope', 'sans-serif'],
      },
      keyframes: {
        shimmer: {
          '100%': {
            transform: 'translateX(100%)',
          },
        },
        'bounce-slow': {
          '0%, 100%': {
            transform: 'translateY(0)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
          },
          '50%': {
            transform: 'translateY(-10%)',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          },
        },
        'fade-in': {
          '0%': {
            opacity: '0',
            transform: 'translateY(10px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'slide-in-right': {
          '0%': {
            transform: 'translateX(100%)',
          },
          '100%': {
            transform: 'translateX(0)',
          },
        },
        'slide-in-left': {
          '0%': {
            transform: 'translateX(-100%)',
          },
          '100%': {
            transform: 'translateX(0)',
          },
        },
        'scale-in': {
          '0%': {
            transform: 'scale(0.9)',
            opacity: '0',
          },
          '100%': {
            transform: 'scale(1)',
            opacity: '1',
          },
        },
        'pulse-subtle': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.8',
          },
        },
      },
      animation: {
        'bounce-slow': 'bounce-slow 3s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'fadeIn': 'fade-in 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
      colors: {
        // Primary - Compass Gold (Warm amber tones for adventure & exploration)
        primary: {
          50: '#fef3c7',
          100: '#fde68a',
          200: '#fcd34d',
          300: '#fbbf24',
          400: '#f59e0b',
          500: '#D97706',
          600: '#B45309',
          700: '#92400e',
          800: '#78350f',
          900: '#451a03',
        },
        // Accent - Warm Gold/Orange tones
        accent: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#D97706',
          700: '#B45309',
        },
        // Neutrals
        cream: '#f8fafc',
        parchment: '#f1f5f9',
        // dusk-200. Dark-mode body text and light-mode hairline borders.
        'warm-gray': DUSK[200],
        charcoal: '#1e293b',
        slate: '#64748b',
        // Dark-mode neutrals. Every `dark:*-dusk-N` class and the `navy`
        // surface tokens below read from this one ramp, so the warmth of the
        // whole dark theme is tuned here.
        dusk: DUSK,
        // Dark Mode surfaces. The token is still called `navy` for history:
        // ~800 usages depend on the name. 950 is the darkest chrome (top bar,
        // bottom nav).
        navy: {
          950: DUSK[950],
          900: DUSK[900],
          800: DUSK[800],
          700: DUSK[700],
        },
        // Gold accent for dark mode
        gold: '#fbbf24',
        // Sky accent for dark mode - sky-300 for better contrast on navy-700 (WCAG AA).
        // Spread Tailwind's own sky scale first: a bare `sky: '#7dd3fc'` REPLACES the
        // scale, which silently kills every `bg-sky-500`/`text-sky-800`/... utility in
        // the app (the Planned status badge rendered with no background at all).
        // DEFAULT keeps the bare `text-sky` / `border-sky` usages working.
        sky: {
          ...colors.sky,
          DEFAULT: '#7dd3fc',
        },
      },
      // Custom box shadows with gold glow for dark mode
      boxShadow: {
        'glow-gold-sm': '0 0 15px rgba(251, 191, 36, 0.15)',
        'glow-gold': '0 0 20px rgba(251, 191, 36, 0.15)',
        'glow-gold-lg': '0 0 30px rgba(251, 191, 36, 0.2)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
