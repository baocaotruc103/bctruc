/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172026',
        hospital: {
          50: '#eef8f7',
          100: '#d6efed',
          500: '#18837f',
          600: '#0f6f6c',
          700: '#0a5756',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(16, 24, 40, 0.06)',
      },
    },
  },
  plugins: [],
}
