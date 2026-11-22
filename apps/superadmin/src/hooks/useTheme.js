import { useEffect, useState } from 'react';

// Light by default; remembers the superadmin's choice in this browser.
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('jptl-superadmin-theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('jptl-superadmin-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return { theme, toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}
