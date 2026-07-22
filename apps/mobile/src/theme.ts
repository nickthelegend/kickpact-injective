/**
 * Kickpact premium design tokens — ported 1:1 from the web app's palette so the
 * React Native UI matches the original pixel look exactly.
 */
export const C = {
  frame: "#1b2548",
  frameDark: "#151837",
  frameDeep: "#10162e",
  panel: "rgba(0,0,0,0.30)",
  panelBorder: "rgba(0,0,0,0.55)",
  bevel: "rgba(0,0,0,0.45)",
  highlight: "rgba(255,255,255,0.10)",

  eth: "#627eea",
  ethLight: "#8aa0f5",
  green: "#3ba34b",
  greenLight: "#54c468",
  importBlue: "#2c3a63",
  importBlueLight: "#4a5c91",
  gold: "#e8b84b",

  white: "#ffffff",
  white70: "rgba(255,255,255,0.70)",
  white60: "rgba(255,255,255,0.60)",
  white45: "rgba(255,255,255,0.45)",
  white35: "rgba(255,255,255,0.35)",
  white15: "rgba(255,255,255,0.15)",
  amber: "#f4c869",
} as const

/** Loaded via expo-font in App.tsx. */
export const FONT = {
  pixel: "KickpactPixel",
  display: "KickpactDisplay",
} as const
