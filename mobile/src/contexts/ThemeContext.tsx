import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LIGHT_COLORS, DARK_COLORS, ThemeColors, ThemeMode, applyTheme } from "../constants/theme";

const THEME_STORAGE_KEY = "@hosteldesk_theme_mode";

interface ThemeContextValue {
  themeMode: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeMode: "system",
  colors: LIGHT_COLORS,
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? "light");

  useEffect(() => {
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
      if (themeMode === "system") {
        applyTheme("system", colorScheme);
      }
    });
    return () => listener.remove();
  }, [themeMode]);

  useEffect(() => {
    async function loadSavedTheme() {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved === "dark" || saved === "light" || saved === "system") {
          setThemeModeState(saved as ThemeMode);
          applyTheme(saved as ThemeMode, Appearance.getColorScheme());
        } else {
          // Default to system auto-detection
          setThemeModeState("system");
          applyTheme("system", Appearance.getColorScheme());
        }
      } catch {
        // default to system
        applyTheme("system", Appearance.getColorScheme());
      }
    }
    void loadSavedTheme();
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    applyTheme(mode, Appearance.getColorScheme());
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      let next: ThemeMode = "dark";
      if (prev === "system") {
        next = systemScheme === "dark" ? "light" : "dark";
      } else if (prev === "light") {
        next = "dark";
      } else {
        next = "light";
      }
      applyTheme(next, Appearance.getColorScheme());
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, [systemScheme]);

  const effectiveDark =
    themeMode === "dark" || (themeMode === "system" && systemScheme === "dark");
  const colors = effectiveDark ? DARK_COLORS : LIGHT_COLORS;
  const isDark = effectiveDark;

  return (
    <ThemeContext.Provider value={{ themeMode, colors, toggleTheme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
