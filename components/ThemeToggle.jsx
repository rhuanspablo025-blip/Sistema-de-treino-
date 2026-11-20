'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'atlasfit-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) {
        const next = event.newValue === 'light' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        setTheme(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch {}
    setTheme(next);
  };

  return <button className="theme-toggle" type="button" role="switch" aria-checked={theme === 'light'} aria-label="Tema claro" title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'} onClick={toggle}>
    <span className="theme-toggle-track"><span aria-hidden="true">☾</span><span aria-hidden="true">☀</span><i /></span>
    <span className="theme-toggle-label">{theme === 'dark' ? 'Escuro' : 'Claro'}</span>
  </button>;
}
