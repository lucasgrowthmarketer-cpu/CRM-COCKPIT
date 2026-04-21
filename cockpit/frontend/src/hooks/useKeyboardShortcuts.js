import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SHORTCUTS = [
  { keys: ['g', 'd'], path: '/',             label: 'Dashboard' },
  { keys: ['g', 'p'], path: '/pipeline',     label: 'Pipeline' },
  { keys: ['g', 't'], path: '/todos',        label: 'Todos' },
  { keys: ['g', 'e'], path: '/entreprises',  label: 'Entreprises' },
  { keys: ['g', 'c'], path: '/contacts',     label: 'Contacts' },
  { keys: ['g', 'o'], path: '/opportunites', label: 'Opportunités' },
  { keys: ['g', 'f'], path: '/objectifs',    label: 'Objectifs' },
  { keys: ['g', 'i'], path: '/import',       label: 'Import' },
  { keys: ['g', 'm'], path: '/templates',    label: 'Templates (Mail)' },
  { keys: ['g', 's'], path: '/secteurs',     label: 'Secteurs' },
];

export { SHORTCUTS };

export default function useKeyboardShortcuts({ onShowHelp } = {}) {
  const navigate = useNavigate();
  const [gPressed, setGPressed] = useState(false);
  const [gTimeout, setGTimeout] = useState(null);

  const isInputTarget = (e) => {
    const tag = (e.target?.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
      e.target?.isContentEditable;
  };

  const handleKey = useCallback((e) => {
    // Ignore when typing in form fields
    if (isInputTarget(e)) return;
    // Ignore when modifier keys pressed (cmd+k, ctrl+s, etc.)
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const key = e.key.toLowerCase();

    // "?" — help
    if (key === '?') {
      e.preventDefault();
      onShowHelp?.();
      return;
    }

    // "/" — focus search input if there's one on the page
    if (key === '/') {
      const search = document.querySelector('input[data-testid*="search"], input[placeholder*="Recherche" i], input[type="search"]');
      if (search) {
        e.preventDefault();
        search.focus();
      }
      return;
    }

    // "g" prefix: wait for next key
    if (key === 'g' && !gPressed) {
      setGPressed(true);
      if (gTimeout) clearTimeout(gTimeout);
      const t = setTimeout(() => setGPressed(false), 1200);
      setGTimeout(t);
      return;
    }

    // Second key after g
    if (gPressed) {
      e.preventDefault();
      setGPressed(false);
      if (gTimeout) clearTimeout(gTimeout);
      const shortcut = SHORTCUTS.find(s => s.keys[1] === key);
      if (shortcut) {
        navigate(shortcut.path);
        toast.success(`→ ${shortcut.label}`, { duration: 800 });
      }
      return;
    }
  }, [gPressed, gTimeout, navigate, onShowHelp]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [handleKey, gTimeout]);
}
