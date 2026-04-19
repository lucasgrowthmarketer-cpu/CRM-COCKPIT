import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import {
  LayoutDashboard, Building2, Users, Target,
  Layers, User, Menu, LogOut, Lock,
  Flag, ClipboardList, Upload,
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/todos', label: 'Todos', icon: ClipboardList },
  { path: '/entreprises', label: 'Entreprises', icon: Building2 },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/opportunites', label: 'Opportunites', icon: Target },
  { path: '/objectifs', label: 'Objectifs', icon: Flag },
  { path: '/import', label: 'Import', icon: Upload },
  { path: '/secteurs', label: 'Secteurs', icon: Layers },
  { path: '/profil', label: 'Profil', icon: User },
];

function SidebarContent({ onNavigate, locked }) {
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
          // When locked (must_change_password), disable all nav items except /profil
          const disabled = locked && !isProfil;

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
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const locked = !!user?.must_change_password;

  const initials = user?.nom
    ? user.nom.split(' ').map(n => n[0]).join('').toUpperCase()
    : '?';

  return (
    <div className="min-h-screen bg-brand-bg">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-60 bg-white border-r border-brand-border z-30">
        <SidebarContent onNavigate={() => {}} locked={locked} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-60 bg-white">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMobileOpen(false)} locked={locked} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="md:ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-brand-border h-14 flex items-center px-4 md:px-6 gap-4">
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

          <div className="flex items-center gap-3 ml-auto">
            <div className="hidden sm:flex flex-col items-end">
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

        {/* Page content */}
        <main className="p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
