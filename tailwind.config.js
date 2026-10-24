// Tailwind only supplies layout/utility classes. Colors, fonts and sizes come from the CSS variables
// in src/styles/theme.css, so changing the look never requires touching this file.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        panel: 'var(--color-panel)',
        accent: 'var(--color-accent)',
        muted: 'var(--color-text-muted)',
      },
      fontFamily: { sans: 'var(--font-sans)' },
    },
  },
  plugins: [],
};
