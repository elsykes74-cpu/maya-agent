import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ isDark: true, toggle: () => {} });

function applyTheme(dark: boolean) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('maya_dark_mode', dark ? 'true' : 'false');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('maya_dark_mode') : null;
    const dark = stored !== null ? stored === 'true' : true;
    // Apply immediately so data-theme matches React state from the first render
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
    return dark;
  });

  const toggle = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      // Set synchronously so the C proxy in Neo.tsx reads the new value
      // on the same render pass triggered by this state update
      applyTheme(next);
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
