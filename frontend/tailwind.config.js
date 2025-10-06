/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Colors reference CSS custom properties (design tokens) with sane fallbacks
        primary: {
          50: 'var(--color-primary-50, #f5f3ff)',
          100: 'var(--color-primary-100, #ede9fe)',
          200: 'var(--color-primary-200, #ddd6fe)',
          300: 'var(--color-primary-300, #c4b5fd)',
          400: 'var(--color-primary-400, #a78bfa)',
          500: 'var(--color-primary-500, #7c3aed)',
          600: 'var(--color-primary-600, #6d28d9)',
          700: 'var(--color-primary-700, #5b21b6)',
          800: 'var(--color-primary-800, #4c1d96)',
          900: 'var(--color-primary-900, #3b1476)',
        },
        accent: {
          50: 'var(--color-accent-50, #ecfdf5)',
          100: 'var(--color-accent-100, #d1fae5)',
          200: 'var(--color-accent-200, #a7f3d0)',
          300: 'var(--color-accent-300, #6ee7b7)',
          400: 'var(--color-accent-400, #34d399)',
          500: 'var(--color-accent-500, #10b981)',
          600: 'var(--color-accent-600, #059669)',
          700: 'var(--color-accent-700, #047a52)',
          800: 'var(--color-accent-800, #03543a)',
          900: 'var(--color-accent-900, #01402b)',
        },
        neutral: {
          50: 'var(--color-neutral-50, #f8fafc)',
          100: 'var(--color-neutral-100, #f1f5f9)',
          200: 'var(--color-neutral-200, #e2e8f0)',
          300: 'var(--color-neutral-300, #cbd5e1)',
          400: 'var(--color-neutral-400, #94a3b8)',
          500: 'var(--color-neutral-500, #64748b)',
          600: 'var(--color-neutral-600, #475569)',
          700: 'var(--color-neutral-700, #334155)',
          800: 'var(--color-neutral-800, #1f2937)',
          900: 'var(--color-neutral-900, #0f172a)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
      },
    },
  },
  plugins: [],
};
