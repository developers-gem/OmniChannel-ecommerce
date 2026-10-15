const path = require('path');

const webSrcDir = path.resolve(__dirname, 'src').replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    `${webSrcDir}/**/*.{js,ts,jsx,tsx,mdx}`,
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        slate: {
          850: '#151f32',
          900: '#0f172a',
          950: '#020617',
        },
      },
    },
  },
  plugins: [],
};
