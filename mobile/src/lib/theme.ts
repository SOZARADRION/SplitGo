import { useColorScheme } from "react-native";

const palette = {
  light: {
    background: "#F6F8F7",
    surface: "#FFFFFF",
    text: "#0F1A17",
    textMuted: "#5B6B66",
    border: "#D9E2DF",
    primary: "#0E9F6E",
    primaryText: "#FFFFFF",
    danger: "#C8372D",
    dangerSurface: "#FDECEA",
  },
  dark: {
    background: "#0B1210",
    surface: "#141E1B",
    text: "#E8F0ED",
    textMuted: "#93A39E",
    border: "#26332F",
    primary: "#2DCB8E",
    primaryText: "#05140E",
    danger: "#FF7A70",
    dangerSurface: "#3A1714",
  },
};

export type Colors = typeof palette.light;

export function useColors(): Colors {
  return useColorScheme() === "dark" ? palette.dark : palette.light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { md: 12, lg: 16 };
