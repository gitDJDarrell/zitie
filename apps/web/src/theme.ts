import type { Theme } from "./types";

export const THEMES = {
  light: {
    ink: "#FFFFFF", // page background — pure white
    ink2: "#F4F4F4", // card surface
    ink3: "#E6E6E6", // subtle fills, dividers, progress track
    line: "#CFCFCF", // borders
    paper: "#000000", // primary text/action — pure black
    dim: "#555555", // secondary text
    faint: "#8C8C8C", // tertiary text
    cinnabar: "#000000", // accent collapses to black — strict monochrome
  },
  dark: {
    ink: "#000000",
    ink2: "#121212",
    ink3: "#1F1F1F",
    line: "#3A3A3A",
    paper: "#FFFFFF",
    dim: "#9A9A9A",
    faint: "#6A6A6A",
    cinnabar: "#FFFFFF", // accent collapses to white
  },
} satisfies Record<Theme, Record<string, string>>;

// Mutable token object — every component reads from C at render time,
// so swapping its values + a re-render retints the whole app.
export const C: typeof THEMES.light = { ...THEMES.light };

export const FONT_CSS = `
.hz { font-family: -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Segoe UI", Roboto, Arial, sans-serif; }
.ui { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
@keyframes stampIn { 0% { transform: rotate(-8deg) scale(1.7); opacity: 0; } 60% { transform: rotate(-8deg) scale(0.95); opacity: 1; } 100% { transform: rotate(-8deg) scale(1); opacity: 1; } }
.stamp { animation: stampIn 260ms cubic-bezier(.2,.9,.3,1.2) both; }
@media (prefers-reduced-motion: reduce) { .stamp { animation: none; } }
input:focus, button:focus-visible, textarea:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
`;

export function applyTheme(theme: Theme) {
  Object.assign(C, THEMES[theme]);
}
