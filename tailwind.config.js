/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1a1a1a',
        bg: '#0f0f0f',
        accent: '#2dd4bf',
        'accent-dim': '#0d9488',
        pos: '#4ade80',   // green for wins
        neg: '#f87171',   // red for losses
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
