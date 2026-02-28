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
        'warm-gray': '#e2e8f0',
        charcoal: '#1e293b',
        slate: '#64748b',
        // Dark Mode
        navy: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
        },
        // Gold accent for dark mode
        gold: '#fbbf24',
        // Sky accent for dark mode - sky-300 for better contrast on navy-700 (WCAG AA)
        sky: '#7dd3fc',
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
