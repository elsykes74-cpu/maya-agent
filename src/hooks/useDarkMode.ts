import { useState, useEffect } from 'react';

export const THEME_EVENT = 'maya-theme-change';

/** Single source of truth for the current theme. The app is dark-first:
 *  index.html hardcodes data-theme="dark", so an unset preference means dark. */
export function currentThemeIsDark(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('maya_dark_mode');
    if (stored !== null) return stored === 'true';
  }
  return true;
}

export function useDarkMode() {
  const [isDark, setIsDark] = useState(currentThemeIsDark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('maya_dark_mode', isDark ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: isDark }));
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(d => !d) };
}
