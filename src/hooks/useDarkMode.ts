import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('maya_dark_mode') === 'true';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('maya_dark_mode', isDark ? 'true' : 'false');
  }, [isDark]);

  return { isDark, toggle: () => setIsDark(d => !d) };
}
