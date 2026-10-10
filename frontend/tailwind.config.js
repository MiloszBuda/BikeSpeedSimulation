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
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
        },
        swiss: {
          cobalt: '#2563eb',
          cobaltDark: '#1d4ed8',
          obsidian: '#09090b',
          graphite: '#18181b',
          surface: '#f8fafc',
          cardLight: '#ffffff',
          cardDark: '#121215',
          borderLight: '#e4e4e7',
          borderDark: '#27272a',
        }
      },
      boxShadow: {
        'swiss': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'swiss-hover': '0 12px 30px -10px rgba(0, 0, 0, 0.12), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
