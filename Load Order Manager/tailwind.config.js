const colors = require('tailwindcss/colors')

module.exports = {
  purge: {
    enabled: true,
    content: [
      './*.html',
      './*.js',
      './**/*.html',
      './**/*.js'
    ]
  },
  darkMode: 'media', // or 'media' or 'class'
  theme: {
    colors: colors,
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
}
