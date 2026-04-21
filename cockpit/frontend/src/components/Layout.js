import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from './ui/dialog';
import {
  LayoutDashboard, Building2, Users, Target, GitBranch,
  Layers, FileText, User, Menu, LogOut, Lock,
  Flag, ClipboardList, Upload, Sun, Moon, Keyboard,
} from 'lucide-react';
import useKeyboardShortcuts, { SHORTCUTS } from '../hooks/useKeyboardShortcuts';
import api from '../lib/api';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/todos', label: 'Todos', icon: ClipboardList },
  { path: '/pipeline', label: 'Pipeline', icon: GitBranch },
  { path: '/entreprises', label: 'Entreprises', icon: Building2 },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/opportunites', label: 'Opportunites', icon: Target },
  { path: '/objectifs', label: 'Objectifs', icon: Flag },
  { path: '/templates', label: 'Templates', icon: FileText },
  { path: '/import', label: 'Import', icon: Upload },
  { path: '/secteurs', label: 'Secteurs', icon: Layers },
  { path: '/profil', label: 'Profil', icon: User },
];

function KeyBadge({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-6 px-1.5 rounded border border-brand-border bg-brand-bg text-[10px] font-jetbrains font-medium text-brand-text-primary">
      {children}
    </kbd>
  );
}

function KeyboardHelpModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-manrope flex items-center gap-2">
            <Keyboard className="w-5 h-5" /> Raccourcis clavier
          </DialogTitle>
          <DialogDescription className="font-inter text-sm">
            Appuie deux fois rapidement pour naviguer ({"<"} 1s).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2">
          {SHORTCUTS.map((s) => (
            <div key={s.path} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-brand-bg">
              <span className="text-sm font-inter text-brand-text-primary">{s.label}</span>
              <div className="flex items-center gap-1">
                <KeyBadge>{s.keys[0].toUpperCase()}</KeyBadge>
                <span className="text-brand-text-secondary text-xs">puis</span>
                <KeyBadge>{s.keys[1].toUpperCase()}</KeyBadge>
              </div>
            </div>
          ))}
          <div className="border-t border-brand-border my-2" />
          <div className="flex items-center justify-between py-1.5 px-2">
            <span className="text-sm font-inter text-brand-text-primary">Focus recherche de la page</span>
            <KeyBadge>/</KeyBadge>
          </div>
          <div className="flex items-center justify-between py-1.5 px-2">
            <span className="text-sm font-inter text-brand-text-primary">Afficher cette aide</span>
            <KeyBadge>?</KeyBadge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarContent({ onNavigate, locked, notificationCount }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-brand-border">
        <h1 className="font-manrope font-bold text-lg text-brand-text-primary leading-tight">
          Industrial Decision
        </h1>
        <p className="text-xs text-brand-text-secondary font-inter mt-1">Cockpit</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          const Icon = item.icon;
          const isProfil = item.path === '/profil';
          const disabled = locked && !isProfil;
          const showBadge = item.path === '/' && notificationCount > 0;

          const baseClass = `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-inter font-medium transition-colors`;
          const activeClass = isActive
            ? 'bg-brand-primary text-white'
            : 'text-brand-text-secondary hover:bg-brand-bg hover:text-brand-text-primary';
          const disabledClass = 'opacity-40 cursor-not-allowed text-brand-text-secondary';

          if (disabled) {
            return (
              <div
                key={item.path}
                className={`${baseClass} ${disabledClass}`}
                data-testid={`nav-${item.label.toLowerCase()}-locked`}
                title="Changez votre mot de passe pour acceder"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                <Lock className="w-3 h-3" />
              </div>
            );
          }

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`${baseClass} ${activeClass}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                  {notificationCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const locked = !!user?.must_change_password;

  // Fetch notifications count every 60s (lightweight — just count)
  useEffect(() => {
    if (locked || !user) return;
    let cancelled = false;
    const fetchNotif = async () => {
      try {
        const { data } = await api.get('/dashboard/metrics?mode=equipe');
        if (!cancelled) setNotifCount((data?.notifications || []).length);
      } catch {
        // silent fail
      }
    };
    fetchNotif();
    const interval = setInterval(fetchNotif, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, locked]);

  // Global keyboard shortcuts (only when not locked)
  useKeyboardShortcuts({
    onShowHelp: () => !locked && setHelpOpen(true),
  });

  const initials = user?.nom
    ? user.nom.split(' ').map(n => n[0]).join('').toUpperCase()
    : '?';

  return (
    <div className="min-h-screen bg-brand-bg">
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-white border-r border-brand-border z-30">
        <SidebarContent onNavigate={() => {}} locked={locked} notificationCount={notifCount} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60 bg-white">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMobileOpen(false)} locked={locked} notificationCount={notifCount} />
        </SheetContent>
      </Sheet>

      <div className="md:ml-60">
        <header className="sticky top-0 z-20 bg-white border-b border-brand-border h-14 flex items-center px-4 md:px-6 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            data-testid="mobile-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHelpOpen(true)}
              title="Raccourcis clavier (?)"
              data-testid="help-btn"
              className="hidden sm:inline-flex"
            >
              <Keyboard className="w-4 h-4 text-brand-text-secondary" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
              data-testid="theme-toggle"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-brand-text-secondary" /> : <Moon className="w-4 h-4 text-brand-text-secondary" />}
            </Button>
            <div className="hidden sm:flex flex-col items-end ml-2">
              <span className="text-sm font-inter font-medium text-brand-text-primary">{user?.nom}</span>
              <span className="text-xs text-brand-text-secondary capitalize">{user?.role}</span>
            </div>
            <div
              className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center text-sm font-manrope font-semibold shrink-0"
              data-testid="user-avatar"
            >
              {initials}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              data-testid="logout-btn"
              title="Se deconnecter"
            >
              <LogOut className="w-4 h-4 text-brand-text-secondary" />
            </Button>
          </div>
        </header>

        <main className="p-4 md:p-6">
          {children}
        </main>
      </div>

      <KeyboardHelpModal open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
