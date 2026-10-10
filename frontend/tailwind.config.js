/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfeff',
          100: '#cffafe',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        cyber: {
          void: '#05070e',
          surface: '#090e1a',
          card: '#0f172a',
          border: 'rgba(0, 240, 255, 0.2)',
          neon: '#00f0ff',
          amber: '#f59e0b',
          emerald: '#10b981',
          rose: '#f43f5e',
        }
      },
      boxShadow: {
        'neon-cyan': '0 0 15px -2px rgba(0, 240, 255, 0.35)',
        'neon-amber': '0 0 15px -2px rgba(245, 158, 11, 0.35)',
        'cyber-card': '0 4px 20px -2px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 240, 255, 0.15)',
      }
    },
  },
  plugins: [],
}
