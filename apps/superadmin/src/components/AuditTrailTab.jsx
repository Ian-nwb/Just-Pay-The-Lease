import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Search, Download, RefreshCw, ChevronLeft, ChevronRight,
  Shield, User, Building2, Calendar, Hash, Globe, AlertCircle
} from 'lucide-react';
import { getAuditLogs, exportAuditLogsCsv } from '../services/superadminApi';

const ROLE_COLORS = {
  landlord: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  tenant:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  superadmin: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const ACTION_COLOR = (action = '') => {
  if (action.includes('DELETE') || action.includes('REMOVED')) return 'text-rose-400';
  if (action.includes('APPROVED') || action.includes('PAID') || action.includes('CREATED')) return 'text-emerald-400';
  if (action.includes('REJECTED') || action.includes('FAILED')) return 'text-orange-400';
  if (action.includes('UPDATE') || action.includes('EDIT')) return 'text-indigo-400';
  return 'text-ink-soft';
};

const ENTITY_KINDS = ['', 'Ticket', 'Payment', 'Document', 'Unit', 'Property', 'User', 'Announcement', 'Onboarding', 'Lease'];

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export const AuditTrailTab = () => {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [entityKind, setEntityKind] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getAuditLogs({ page, limit, actorRole, entityKind, search, startDate, endDate });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actorRole, entityKind, search, startDate, endDate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [actorRole, entityKind, search, startDate, endDate]);

  const handleExport = async () => {
    try {
      setExporting(true);
      await exportAuditLogsCsv({ actorRole, entityKind, search, startDate, endDate });
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-line rounded-3xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <ClipboardList className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-grotesk text-ink-strong">Audit Trail</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-surface-hover text-ink-muted border border-line">
              {total.toLocaleString()} records
            </span>
          </div>
          <p className="text-xs text-ink-muted font-sans">
            Complete action history for all landlord and tenant operations across the platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-primary text-xs font-grotesk flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={load}
            className="p-2.5 rounded-xl bg-surface hover:bg-surface-hover text-ink-soft border border-line transition btn-press cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, entity…"
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-surface border border-line text-xs text-ink-strong  focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
        <select
          value={actorRole}
          onChange={(e) => setActorRole(e.target.value)}
          className="py-2 px-3 rounded-xl bg-surface border border-line text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        >
          <option value="">All Roles</option>
          <option value="landlord">Landlord</option>
          <option value="tenant">Tenant</option>
          <option value="superadmin">Superadmin</option>
        </select>
        <select
          value={entityKind}
          onChange={(e) => setEntityKind(e.target.value)}
          className="py-2 px-3 rounded-xl bg-surface border border-line text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
        >
          {ENTITY_KINDS.map((k) => (
            <option key={k} value={k}>{k || 'All Entities'}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="flex-1 py-2 px-2 rounded-xl bg-surface border border-line text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" title="Start date" />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="flex-1 py-2 px-2 rounded-xl bg-surface border border-line text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" title="End date" />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-line rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-line bg-surface">
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold whitespace-nowrap"><Calendar className="w-3 h-3 inline mr-1" />Timestamp</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold"><User className="w-3 h-3 inline mr-1" />Actor</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold"><Shield className="w-3 h-3 inline mr-1" />Role</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold">Action</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold"><Building2 className="w-3 h-3 inline mr-1" />Entity</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold"><Hash className="w-3 h-3 inline mr-1" />Entity ID</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold">Reason</th>
                <th className="text-left px-4 py-3 text-ink-muted uppercase tracking-wider text-[10px] font-bold"><Globe className="w-3 h-3 inline mr-1" />IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 bg-surface-hover rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-ink-muted">
                    No audit log entries match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-hover transition-colors">
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap text-[11px]">{fmt(log.timestamp)}</td>
                    <td className="px-4 py-3">
                      {log.actor ? (
                        <div>
                          <div className="text-ink-strong font-semibold text-[11px]">{log.actor.name || '—'}</div>
                          <div className="text-ink-muted text-[10px]">{log.actor.email}</div>
                        </div>
                      ) : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${ROLE_COLORS[log.actorRole] || 'bg-surface-hover text-ink-muted border-line'}`}>
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-bold text-[11px] ${ACTION_COLOR(log.action)}`}>{log.action}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-[10px] max-w-[180px] truncate" title={log.reason || ''}>{log.reason || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft text-[11px]">{log.entityKind || '—'}</td>
                    <td className="px-4 py-3 text-ink-muted text-[10px] max-w-[120px] truncate" title={log.entityId}>
                      {log.entityId ? String(log.entityId).slice(-8) : '—'}
                    </td>
                    <td className="px-4 py-3 text-ink-muted text-[10px]">{log.ipAddress || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line text-xs font-mono text-ink-muted">
            <span>Page {page} of {totalPages} · {total.toLocaleString()} total records</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditTrailTab;
