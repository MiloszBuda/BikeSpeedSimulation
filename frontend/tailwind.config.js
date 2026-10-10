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
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        nordic: {
          forest: '#0a1912',
          pine: '#0f291e',
          sage: '#2e5e46',
          terracotta: '#d97736',
          copper: '#c2410c',
          sand: '#fbf9f5',
          stone: '#1a3025',
          border: 'rgba(46, 94, 70, 0.35)',
        }
      },
      boxShadow: {
        'nordic': '0 4px 20px -2px rgba(8, 20, 14, 0.5), 0 0 0 1px rgba(46, 94, 70, 0.25)',
        'terracotta': '0 4px 15px -1px rgba(217, 119, 54, 0.3)',
      }
    },
  },
  plugins: [],
}
