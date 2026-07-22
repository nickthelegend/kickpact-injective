/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Kickpact premium palette (matches the web app)
        frame: "#1b2548",
        "frame-dark": "#151837",
        "frame-deep": "#10162e",
        eth: "#627eea",
        "eth-light": "#8aa0f5",
        "kickpact-green": "#3ba34b",
        "kickpact-green-light": "#54c468",
        gold: "#e8b84b",
        "ink-blue": "#0f1430",
        "muted-blue": "#8fb4ff",
      },
      fontFamily: {
        pixel: ["KickpactPixel"],
        display: ["KickpactDisplay"],
      },
    },
  },
  plugins: [],
}
