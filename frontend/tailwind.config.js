/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#E5A645',
          50: '#FDF6E9',
          100: '#FAECD3',
          200: '#F5D9A7',
          300: '#F0C57B',
          400: '#EBB25F',
          500: '#E5A645',
          600: '#D4922A',
          700: '#B07A22',
          800: '#8C621B',
          900: '#684A14',
        },
        dark: {
          DEFAULT: '#222222',
          50: '#F4F4F4',
          100: '#E8E8E8',
          200: '#D1D1D1',
          300: '#BBBBBB',
          400: '#999999',
          500: '#777777',
          600: '#555555',
          700: '#444444',
          800: '#333333',
          900: '#222222',
          950: '#111111',
        },
      },
      fontFamily: {
        display: ['"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        body: ['"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'gold': '0 4px 24px -4px rgba(229, 166, 69, 0.4)',
        'gold-lg': '0 8px 40px -8px rgba(229, 166, 69, 0.5)',
        'dark': '0 4px 24px -4px rgba(0, 0, 0, 0.6)',
        'panel': '0 0 0 1px rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-dark': 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
      },
      backgroundSize: {
        'grid': '48px 48px',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-gold': 'pulse-gold 2s infinite',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'pulse-gold': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(229, 166, 69, 0)' }, '50%': { boxShadow: '0 0 0 8px rgba(229, 166, 69, 0.15)' } },
        'slide-in-right': { 'from': { transform: 'translateX(100%)', opacity: '0' }, 'to': { transform: 'translateX(0)', opacity: '1' } },
        'fade-in': { 'from': { opacity: '0', transform: 'translateY(4px)' }, 'to': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
