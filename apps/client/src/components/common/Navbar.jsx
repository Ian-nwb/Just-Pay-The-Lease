import React, { useState } from 'react';
import { Building2, Menu, X, Sun, Moon } from 'lucide-react';

const LINKS = [
  ['features', 'Product'],
  ['roles', 'Who it’s for'],
  ['testimonials', 'Customers'],
  ['pricing', 'Pricing'],
];

export const Navbar = ({ theme, onToggleTheme, onNavigate = () => {} }) => {
  const [open, setOpen] = useState(false);

  const go = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setOpen(false);
  };

  const themeLabel = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--l-line)] bg-[var(--l-bg)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4"
          aria-label="JPTL home"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--l-primary)] text-[var(--l-primary-ink)]">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="font-grotesk text-lg font-semibold tracking-tight text-[var(--l-ink)]">JPTL</span>
        </button>

        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">
          {LINKS.map(([id, label]) => (
            <button key={id} type="button" onClick={() => go(id)} className="l-btn l-btn-ghost l-btn-sm">
              {label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          <button type="button" onClick={onToggleTheme} aria-label={themeLabel} title={themeLabel} className="l-btn l-btn-ghost l-btn-sm px-2.5">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => onNavigate('/tenant-login')} className="l-btn l-btn-ghost l-btn-sm">
            Resident login
          </button>
          <button type="button" onClick={() => onNavigate('/login')} className="l-btn l-btn-ghost l-btn-sm">
            Landlord login
          </button>
          <button type="button" onClick={() => onNavigate('/register')} className="l-btn l-btn-primary l-btn-sm ml-1.5">
            Landlord sign up
          </button>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <button type="button" onClick={onToggleTheme} aria-label={themeLabel} className="l-btn l-btn-ghost l-btn-sm px-2.5">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'} className="l-btn l-btn-ghost l-btn-sm px-2.5">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--l-line)] bg-[var(--l-bg)] px-4 pb-4 pt-2 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {LINKS.map(([id, label]) => (
              <button key={id} type="button" onClick={() => go(id)} className="py-3 text-left text-[15px] text-[var(--l-ink-soft)] border-b border-[var(--l-line)]">
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { onNavigate('/tenant-login'); setOpen(false); }} className="l-btn l-btn-secondary">Resident login</button>
            <button type="button" onClick={() => { onNavigate('/login'); setOpen(false); }} className="l-btn l-btn-secondary">Landlord login</button>
            <button type="button" onClick={() => { onNavigate('/register'); setOpen(false); }} className="l-btn l-btn-primary col-span-2">Landlord sign up</button>
          </div>
        </div>
      )}
    </header>
  );
};
