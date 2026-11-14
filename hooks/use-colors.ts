import { Colors, type ColorScheme, type ThemeColorPalette } from "@/constants/theme";
import { ACCENT_COLORS, useThemeContext } from "@/lib/theme-provider";

/**
 * Returns the current theme's color palette.
 * Usage: const colors = useColors(); then colors.text, colors.background, etc.
 */
export function useColors(colorSchemeOverride?: ColorScheme): ThemeColorPalette {
  const { colorScheme, accent } = useThemeContext();
  const scheme = (colorSchemeOverride ?? colorScheme ?? "light") as ColorScheme;
  const primary = ACCENT_COLORS[accent];
  return { ...Colors[scheme], primary, tint: primary, tabIconSelected: primary };
}
