/** @type {import("tailwindcss").Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./plugins/**/*.{js,cjs}",
  ],
  theme: { extend: {} },
  plugins: [require("daisyui")],
};
