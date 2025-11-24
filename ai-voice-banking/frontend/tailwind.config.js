/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'music-1': 'music-wave 1s ease-in-out infinite',
        'music-2': 'music-wave 1.2s ease-in-out infinite 0.1s',
        'music-3': 'music-wave 0.8s ease-in-out infinite 0.2s',
      },
      keyframes: {
        'music-wave': {
          '0%, 100%': { height: '20%' },
          '50%': { height: '80%' },
        }
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #1e293b 1px, transparent 1px), linear-gradient(to bottom, #1e293b 1px, transparent 1px)",
      },
      backgroundSize: {
        'grid-pattern': '40px 40px',
      }
    },
  },
  plugins: [],
}