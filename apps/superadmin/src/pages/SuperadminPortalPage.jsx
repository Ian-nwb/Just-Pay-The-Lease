import React, { useState, useEffect } from 'react';
import { SecurityTab } from '../components/SecurityTab';
import {
  ShieldCheck, Activity, Users, Building2, Layers,
  AlertTriangle, RefreshCw, HardDrive, LogOut, ExternalLink, Sliders, Power, ClipboardList, Sun, Moon
} from 'lucide-react';
import { UserManagementTab } from '../components/UserManagementTab';
import { PropertiesTab } from '../components/PropertiesTab';
import { UnitsTab } from '../components/UnitsTab';
import { SessionMonitorTab } from '../components/SessionMonitorTab';
import { AuditTrailTab } from '../components/AuditTrailTab';
import { getMaintenanceStatus, setMaintenanceMode } from '../services/superadminApi';

export const SuperadminPortalPage = ({ onLogout = () => {}, theme = 'light', onToggleTheme = () => {} }) => {
  const [activeTab, setActiveTab] = useState('properties'); // Default to properties management
  const [maintenanceModeEnabled, setMaintenanceModeEnabled] = useState(false);
  const [togglingMaintenance, setTogglingMaintenance] = useState(false);

  useEffect(() => {
    getMaintenanceStatus()
      .then((res) => {
        if (res && res.enabled !== undefined) {
          setMaintenanceModeEnabled(res.enabled);
        }
      })
      .catch((err) => console.warn('Could not check maintenance status:', err.message));
  }, []);

  const handleToggleMaintenance = async () => {
    const nextState = !maintenanceModeEnabled;
    const confirmText = nextState
      ? 'Enable Maintenance Mode? Non-superadmin access (landlords & tenants) will be temporarily blocked with HTTP 503.'
      : 'Disable Maintenance Mode and restore full platform access for all users?';
    if (!window.confirm(confirmText)) return;

    try {
      setTogglingMaintenance(true);
      const res = await setMaintenanceMode(nextState);
      setMaintenanceModeEnabled(res.enabled);
    } catch (err) {
      alert(`Failed to update maintenance mode: ${err.message}`);
    } finally {
      setTogglingMaintenance(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-sunken text-ink-strong font-sans selection:bg-indigo-600/30 selection:text-info-text flex flex-col">
      
      {/* ─── TOP CONTROL HEADER ─── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-line px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold shadow-lg shadow-indigo-600/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold font-grotesk tracking-tight text-ink-strong">
                JPTL<span className="text-indigo-400">.SUPERADMIN</span>
              </h1>
              <span className="badge badge-info font-mono">
                ROOT COMMAND CENTER
              </span>
            </div>
            <p className="text-[11px] text-ink-muted font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>System Uptime: 99.99% &bull; Database: Online</span>
            </p>
          </div>
        </div>

        {/* Global Controls & Logout */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Maintenance Mode Interactive Toggle */}
          <button
            onClick={handleToggleMaintenance}
            disabled={togglingMaintenance}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 font-mono text-xs font-semibold transition btn-press cursor-pointer ${
              maintenanceModeEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-surface text-ink-muted border-line hover:text-ink-strong hover:bg-surface-hover'
            }`}
            title="Toggle Platform Maintenance Mode (503 Gatekeeper)"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                maintenanceModeEnabled ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
              }`}
            />
            <span>
              {togglingMaintenance
                ? 'Updating...'
                : maintenanceModeEnabled
                ? 'Maintenance: ON'
                : 'Maintenance: OFF'}
            </span>
          </button>

          {/* Swagger API Docs Quick Link */}
          <a
            href="http://localhost:8000/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            title="Open Interactive Swagger Documentation"
          >
            <span>Swagger API Docs</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="btn btn-ghost btn-sm btn-icon"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={onLogout}
            className="btn btn-secondary btn-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* ─── NAVIGATION MODULE TABS ─── */}
      <div className="bg-surface border-b border-line px-6 py-2 flex items-center gap-2 overflow-x-auto text-xs font-grotesk font-semibold">
        {[
          { key: 'properties', label: 'Properties Registry', icon: Building2 },
          { key: 'units', label: 'Units Inventory', icon: Layers },
          { key: 'live-monitor', label: 'Live Login Monitor', icon: Activity },
          { key: 'users', label: 'User & Tenant Hierarchy', icon: Users },
          { key: 'audit-trail', label: 'Audit Trail', icon: ClipboardList },
          { key: 'overview', label: 'System Overview', icon: HardDrive },
          { key: 'security', label: 'Security', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 transition-all btn-press shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-brand text-brand-ink border-indigo-500 shadow-md'
                  : 'bg-transparent text-ink-muted border-transparent hover:text-ink-strong hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── MAIN CONTENT AREA ─── */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">

        {/* 1. PROPERTIES REGISTRY CRUD */}
        {activeTab === 'properties' && <PropertiesTab />}

        {/* 2. UNITS INVENTORY CRUD */}
        {activeTab === 'units' && <UnitsTab />}

        {/* 3. LIVE LOGIN MONITOR */}
        {activeTab === 'live-monitor' && <SessionMonitorTab />}

        {/* 4. USER & TENANT HIERARCHY */}
        {activeTab === 'users' && <UserManagementTab />}

        {/* 5. AUDIT TRAIL */}
        {activeTab === 'audit-trail' && <AuditTrailTab />}

        {/* 6. SYSTEM OVERVIEW */}
        {activeTab === 'security' && <SecurityTab />}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="p-5 rounded-2xl bg-surface border border-line space-y-2">
                <span className="text-ink-muted block text-[10px] uppercase">Platform Role</span>
                <strong className="text-xl font-grotesk font-extrabold text-ink-strong block">Superadmin Root</strong>
                <span className="text-emerald-400 text-[10px]">Unrestricted scope</span>
              </div>

              <div className="p-5 rounded-2xl bg-surface border border-line space-y-2">
                <span className="text-ink-muted block text-[10px] uppercase">API Status</span>
                <strong className="text-xl font-grotesk font-extrabold text-emerald-400 block">REST + SSE Live</strong>
                <span className="text-emerald-400 text-[10px]">Telemetry active</span>
              </div>

              <div className="p-5 rounded-2xl bg-surface border border-line space-y-2">
                <span className="text-ink-muted block text-[10px] uppercase">Documentation</span>
                <strong className="text-xl font-grotesk font-extrabold text-indigo-400 block">Swagger 3.0</strong>
                <span className="text-indigo-400 text-[10px]">Interactive UI at /api/docs</span>
              </div>

              <div className="p-5 rounded-2xl bg-surface border border-line space-y-2">
                <span className="text-ink-muted block text-[10px] uppercase">Real-Time Engine</span>
                <strong className="text-xl font-grotesk font-extrabold text-purple-400 block">SSE Streaming</strong>
                <span className="text-purple-400 text-[10px]">Instant login notifications</span>
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-surface border border-line space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold font-grotesk text-ink-strong flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" /> Platform Maintenance Toggle
                </h2>
                <button
                  onClick={handleToggleMaintenance}
                  disabled={togglingMaintenance}
                  className={`px-3.5 py-2 rounded-xl font-bold font-mono text-[11px] btn-press cursor-pointer transition flex items-center gap-2 ${
                    maintenanceModeEnabled
                      ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-surface-hover text-ink-soft hover:bg-slate-700'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>
                    {togglingMaintenance
                      ? 'UPDATING...'
                      : maintenanceModeEnabled
                      ? 'MODE: ACTIVE (LOCKDOWN)'
                      : 'MODE: DISABLED (NORMAL)'}
                  </span>
                </button>
              </div>
              <p className="text-xs text-ink-muted font-sans">
                Controls maintenance lockdown state. In maintenance mode, non-admin logins can be suspended.
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};
export default SuperadminPortalPage;
