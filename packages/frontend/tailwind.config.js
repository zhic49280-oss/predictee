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
        near: {
          green: "#00EC97",
          dark: "#0F172A",
          card: "#1E293B",
          border: "#334155"
        }
      }
    },
  },
  plugins: [],
}
