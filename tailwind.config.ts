import type { Config } from 'tailwindcss';
import { fontFamily } from 'tailwindcss/defaultTheme';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#FFFBF0',
          100: '#FFF3CC',
          200: '#FFE380',
          300: '#E8C16A',
          400: '#D4A843',
          DEFAULT: '#C9922A',
          light: '#E8C16A',
          dark: '#8B6010',
          600: '#A87420',
          700: '#8B6010',
          800: '#6B4A0C',
          900: '#4A3308',
        },
        cream: {
          DEFAULT: '#FFF8EE',
          50: '#FFFDF8',
          100: '#FFF8EE',
          200: '#FFF2D6',
          300: '#FFEDC0',
          400: '#FFE4A0',
        },
        teal: {
          DEFAULT: '#1a6b5a',
          600: '#145548',
          400: '#2a8a75',
        },
        deep: {
          DEFAULT: '#1A0A00',
          100: '#2C1200',
          200: '#3D1A00',
        },
        divine: {
          purple: '#6B21A8',
          saffron: '#F97316',
          lotus: '#EC4899',
        },
      },
      fontFamily: {
        cinzel: ['var(--font-cinzel)', 'Cinzel', 'serif'],
        'cinzel-decorative': ['var(--font-cinzel-decorative)', 'Cinzel Decorative', 'serif'],
        crimson: ['var(--font-crimson)', 'Crimson Text', 'serif'],
        lato: ['var(--font-lato)', 'Lato', ...fontFamily.sans],
        montserrat: ['var(--font-montserrat)', 'Montserrat', ...fontFamily.sans],
        'great-vibes': ['var(--font-great-vibes)', 'Great Vibes', 'cursive'],
        sacramento: ['var(--font-great-vibes)', 'Sacramento', 'cursive'],
        namaste: ['var(--font-yatra)', 'Yatra One', 'serif'],
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #C9922A 0%, #E8C16A 50%, #C9922A 100%)',
        'divine-gradient': 'radial-gradient(ellipse at center, #FFF8EE 0%, #FFEDC0 60%, #FFE4A0 100%)',
        'dark-gradient': 'linear-gradient(160deg, #1A0A00 0%, #2C1200 100%)',
        'hero-radial': 'radial-gradient(ellipse at 20% 50%, rgba(201,146,42,0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, rgba(26,107,90,0.1) 0%, transparent 40%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
      },
      boxShadow: {
        'gold': '0 0 20px rgba(201,146,42,0.4), 0 0 40px rgba(201,146,42,0.2)',
        'gold-sm': '0 4px 20px rgba(201,146,42,0.3)',
        'divine': '0 20px 60px rgba(201,146,42,0.25)',
        'inner-gold': 'inset 0 0 20px rgba(201,146,42,0.1)',
        glass: '0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'float-slow': 'float 7s ease-in-out infinite',
        'float-fast': 'float 2.5s ease-in-out infinite',
        'pulse-gold': 'pulseGold 2.5s ease-in-out infinite',
        'glow': 'glow 3s ease-in-out infinite alternate',
        'shimmer': 'shimmer 2s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'bounce-slow': 'bounce 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.6s ease-out',
        'fade-in': 'fadeIn 0.8s ease-out',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-12px) rotate(2deg)' },
        },
        pulseGold: {
          '0%,100%': { boxShadow: '0 0 20px rgba(201,146,42,0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(201,146,42,0.7), 0 0 80px rgba(201,146,42,0.3)' },
        },
        glow: {
          '0%': { textShadow: '0 0 10px rgba(201,146,42,0.5)' },
          '100%': { textShadow: '0 0 30px rgba(201,146,42,0.9), 0 0 60px rgba(201,146,42,0.5)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      spacing: {
        '128': '32rem',
        '144': '36rem',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    // @tailwindcss/aspect-ratio is intentionally NOT loaded: it disables Tailwind's native
    // `aspect-*` utilities, which collapsed the product-page image to 0px height.
  ],
};

export default config;
