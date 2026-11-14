import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance, Platform, View } from "react-native";
import { colorScheme as nativewindColorScheme, vars } from "nativewind";

import { SchemeColors, type ColorScheme } from "@/constants/theme";

const THEME_STORAGE_KEY = "elunariq.theme.v1";
const ACCENT_STORAGE_KEY = "elunariq.accent.v1";
export const ACCENT_COLORS = { violet: "#6551C8", teal: "#226857", coral: "#A64540" } as const;
export type AccentChoice = keyof typeof ACCENT_COLORS;

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  accent: AccentChoice;
  setAccent: (accent: AccentChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>("light");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [accent, setAccentState] = useState<AccentChoice>("violet");

  const applyScheme = useCallback((scheme: ColorScheme, accentChoice: AccentChoice) => {
    nativewindColorScheme.set(scheme);
    if (Platform.OS !== "web") Appearance.setColorScheme?.(scheme);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.dataset.theme = scheme;
      root.classList.toggle("dark", scheme === "dark");
      const palette = SchemeColors[scheme];
      Object.entries(palette).forEach(([token, value]) => {
        root.style.setProperty(`--color-${token}`, token === "primary" ? ACCENT_COLORS[accentChoice] : value);
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([AsyncStorage.getItem(THEME_STORAGE_KEY), AsyncStorage.getItem(ACCENT_STORAGE_KEY)])
      .then(([saved, savedAccent]) => {
        if (!cancelled && (saved === "light" || saved === "dark")) {
          setColorSchemeState(saved);
        }
        if (!cancelled && savedAccent && savedAccent in ACCENT_COLORS) setAccentState(savedAccent as AccentChoice);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setThemeLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setColorScheme = useCallback((scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, scheme).catch(() => undefined);
    applyScheme(scheme, accent);
  }, [applyScheme, accent]);

  const setAccent = useCallback((nextAccent: AccentChoice) => {
    setAccentState(nextAccent);
    void AsyncStorage.setItem(ACCENT_STORAGE_KEY, nextAccent).catch(() => undefined);
    applyScheme(colorScheme, nextAccent);
  }, [applyScheme, colorScheme]);

  useEffect(() => {
    if (!themeLoaded) return;
    applyScheme(colorScheme, accent);
  }, [applyScheme, colorScheme, accent, themeLoaded]);

  const themeVariables = useMemo(
    () =>
      vars({
        "color-primary": ACCENT_COLORS[accent],
        "color-background": SchemeColors[colorScheme].background,
        "color-surface": SchemeColors[colorScheme].surface,
        "color-foreground": SchemeColors[colorScheme].foreground,
        "color-muted": SchemeColors[colorScheme].muted,
        "color-border": SchemeColors[colorScheme].border,
        "color-success": SchemeColors[colorScheme].success,
        "color-warning": SchemeColors[colorScheme].warning,
        "color-error": SchemeColors[colorScheme].error,
      }),
    [colorScheme, accent],
  );

  const value = useMemo(
    () => ({
      colorScheme,
      setColorScheme,
      accent,
      setAccent,
    }),
    [colorScheme, setColorScheme, accent, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, themeVariables]}>{children}</View>
    </ThemeContext.Provider>
  );
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeContext must be used within ThemeProvider");
  }
  return ctx;
}
