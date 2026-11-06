import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';
import {
  resolveScheme,
  type AppearancePreference,
  type Scheme,
} from './appearance';
import { readAppearancePreference, setAppearancePreference } from './preferences';
import { darkColors, lightColors, type ColorPalette } from './theme';

interface ThemeState {
  scheme: Scheme;
  colors: ColorPalette;
  preference: AppearancePreference;
  setPreference: (p: AppearancePreference) => void;
}

const ThemeContext = createContext<ThemeState>({
  scheme: 'light',
  colors: lightColors,
  preference: 'system',
  setPreference: () => {},
});

/**
 * Resolves the Appearance setting against the phone and provides the active
 * palette. Light/Dark are also pushed to `Appearance.setColorScheme`, so
 * native UI (keyboard, system alerts, date pickers) follows the app.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPref] = useState<AppearancePreference>(readAppearancePreference);
  const system = useColorScheme();

  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  }, [preference]);

  const setPreference = useCallback((p: AppearancePreference) => {
    setPref(p);
    setAppearancePreference(p).catch(() => {});
  }, []);

  const value = useMemo<ThemeState>(() => {
    // With an override set, useColorScheme() already reports it; resolving
    // again keeps the first frame right before the effect above has run.
    const scheme = resolveScheme(preference, system);
    return {
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      preference,
      setPreference,
    };
  }, [preference, system, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}

/** The active palette. Use this for any color read inside a component. */
export function useColors(): ColorPalette {
  return useContext(ThemeContext).colors;
}

/**
 * Theme-aware replacement for a module-level `StyleSheet.create`:
 *
 *   const useStyles = makeStyles((colors) => ({ row: { color: colors.graphite } }));
 *   function Row() { const styles = useStyles(); … }
 *
 * Styles are built once per palette and cached, so this is as cheap as a
 * static StyleSheet after the first render in each scheme.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ColorPalette) => T,
): () => T {
  const cache = new Map<ColorPalette, T>();
  return function useStyles(): T {
    const colors = useColors();
    let styles = cache.get(colors);
    if (!styles) {
      styles = StyleSheet.create(factory(colors));
      cache.set(colors, styles);
    }
    return styles;
  };
}
