import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper:  '#FFFFFF',
        cream:  '#F5F5F4',
        ink:    '#111111',
        gold:   '#8a8a8a',
        mut:    '#777777',
        canvas: '#e7e5df',
      },
      fontFamily: {
        serif: ['var(--font-bodoni)', 'Georgia', 'serif'],
        sans:  ['var(--font-mulish)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
