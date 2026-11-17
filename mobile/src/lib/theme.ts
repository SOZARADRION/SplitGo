import { useColorScheme } from "react-native";

/**
 * Identidade visual SOZARADRION / SplitGo (ver docs/assets/splitgo-banner.svg):
 * ardósia escura (#0F172A → #163E49) com acento esmeralda (#34D399 / #6EE7B7).
 */
const palette = {
  light: {
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceMuted: "#F1F5F9",
    text: "#0F172A",
    textMuted: "#64748B",
    border: "#E2E8F0",
    primary: "#047857",
    primaryText: "#FFFFFF",
    primarySoft: "#D1FAE5",
    positive: "#047857",
    negative: "#B91C1C",
    danger: "#B91C1C",
    dangerSurface: "#FEE2E2",
    warning: "#92400E",
    warningSurface: "#FEF3C7",
    hero: "#0F172A",
    heroText: "#F8FAFC",
    heroMuted: "#CBD5E1",
    heroAccent: "#6EE7B7",
  },
  dark: {
    background: "#0B1120",
    surface: "#0F172A",
    surfaceMuted: "#1E293B",
    text: "#F1F5F9",
    textMuted: "#94A3B8",
    border: "#1E293B",
    primary: "#34D399",
    primaryText: "#052E22",
    primarySoft: "#064E3B",
    positive: "#34D399",
    negative: "#F87171",
    danger: "#F87171",
    dangerSurface: "#3B1219",
    warning: "#FCD34D",
    warningSurface: "#3A2A07",
    hero: "#163E49",
    heroText: "#F8FAFC",
    heroMuted: "#CBD5E1",
    heroAccent: "#6EE7B7",
  },
};

export type Colors = typeof palette.light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
