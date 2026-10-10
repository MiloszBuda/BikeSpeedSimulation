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
          50: '#fefce8',
          100: '#fef9c3',
          500: '#eab308',
          600: '#ca8a04',
          700: '#a16207',
        },
        brutal: {
          yellow: '#facc15',
          orange: '#ff5400',
          lime: '#a3e635',
          cyan: '#06b6d4',
          pink: '#f43f5e',
          bgLight: '#f4f4f0',
          bgDark: '#0a0a0c',
          borderLight: '#18181b',
          borderDark: '#f4f4f5',
        }
      },
      boxShadow: {
        'brutal': '4px 4px 0px 0px #18181b',
        'brutal-dark': '4px 4px 0px 0px #f4f4f5',
        'brutal-lg': '6px 6px 0px 0px #18181b',
        'brutal-lg-dark': '6px 6px 0px 0px #f4f4f5',
        'brutal-sm': '2px 2px 0px 0px #18181b',
        'brutal-sm-dark': '2px 2px 0px 0px #f4f4f5',
      }
    },
  },
  plugins: [],
}
