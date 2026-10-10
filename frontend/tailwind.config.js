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
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#fc4c02',
          600: '#ea580c',
          700: '#c2410c',
        },
        strava: {
          DEFAULT: '#fc4c02',
          dark: '#e34402',
          light: '#ff6726',
          carbon: '#111215',
          surface: '#18191f',
          panel: '#20222a',
          border: '#2a2d3a',
          yellow: '#facc15',
        }
      },
      boxShadow: {
        'strava': '0 4px 15px -1px rgba(252, 76, 2, 0.35)',
        'racing-card': '0 4px 20px -2px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(252, 76, 2, 0.15)',
      }
    },
  },
  plugins: [],
}
