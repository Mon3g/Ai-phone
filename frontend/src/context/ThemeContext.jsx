import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // default to dark so the app matches the existing styles
  const [theme, setTheme] = useState('dark');
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Apply theme to document element so Tailwind's `dark:` variants work.
  useEffect(() => {
    try {
      const el = document.documentElement;
      if (theme === 'dark') {
        el.classList.add('dark');
      } else {
        el.classList.remove('dark');
      }
    } catch (e) {
      // ignore (server-side rendering or test environments)
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default ThemeContext;
