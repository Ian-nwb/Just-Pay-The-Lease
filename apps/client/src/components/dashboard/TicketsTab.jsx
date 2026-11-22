import React, { useState, useEffect, useMemo } from 'react';
import { Wrench, Clock, CheckCircle2, AlertTriangle, ShieldAlert, User, Building2, Trash2, HardHat, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfirmationModal } from '../common/ConfirmationModal';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { landlordApi } from '../../services/api';

export const TicketsTab = ({
  tickets: initialTickets = [],
  searchQuery = '',
  onOpenNewTicket,
  onUpdateStatus,
  onDeleteTicket,
  onAssignTechnician,
}) => {
  const toast = useToast();
  const { user } = useAuth();
  const isTechnician = user?.role === 'staff' && user?.staffType === 'technician';
  const currentUserName = user
    ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Landlord'
    : 'Landlord';

  const [tickets, setTickets] = useState(initialTickets);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingTicket, setDeletingTicket] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const pageSize = 5;

  useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  useEffect(() => {
    if (user?.role === 'staff' && user?.staffType !== 'property_manager') return;
    let active = true;
    landlordApi.getTechnicians()
      .then((response) => { if (active) setTechnicians(response.data || []); })
      .catch(() => { if (active) setTechnicians([]); });
    return () => { active = false; };
  }, [user?.role, user?.staffType]);

  const handleAssignTech = (ticketId, staffId) => {
    const technician = technicians.find((entry) => String(entry._id || entry.id) === String(staffId));
    if (!technician) return;
    const name = `${technician.firstName || ''} ${technician.lastName || ''}`.trim();
    const techData = { staffId: technician._id || technician.id, name, phone: technician.phone || '', company: 'JPTL Technician', eta: '' };
    if (onAssignTechnician) {
      onAssignTechnician(ticketId, { ...techData, assignedStaff: technician });
    }
    toast.success(`Technician ${name} assigned to ticket.`);
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId || t._id === ticketId
          ? {
              ...t,
              assignedTechnician: { ...(t.assignedTechnician || {}), ...techData },
              assignedStaff: technician,
            }
          : t
      )
    );
  };

  const handleUpdateStatus = (ticketId, newStatus) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) {
          const newHistoryItem = {
            status: newStatus,
            changedBy: currentUserName,
            changedByName: currentUserName,
            userRole: 'landlord',
            timestamp: new Date().toISOString(),
            note: `Status changed to ${newStatus.replace('_', ' ')}`,
          };
          const updated = {
            ...t,
            status: newStatus,
            statusHistory: [...(t.statusHistory || []), newHistoryItem],
          };
          if (onUpdateStatus) {
            onUpdateStatus(ticketId, newStatus, updated);
          }
          toast.success(`Ticket status updated to ${newStatus.replace('_', ' ')}.`);
          return updated;
        }
        return t;
      })
    );
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (t.title ?? '').toLowerCase().includes(q) ||
        (t.propertyName ?? '').toLowerCase().includes(q) ||
        (t.unitLabel ?? '').toLowerCase().includes(q) ||
        (t.tenantName ?? '').toLowerCase().includes(q);

      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return matchesSearch;
    });
  }, [tickets, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const paginatedTickets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTickets.slice(start, start + pageSize);
  }, [filteredTickets, currentPage, pageSize]);

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'high':
        return (
          <span className="badge badge-danger font-mono flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> High
          </span>
        );
      case 'medium':
        return (
          <span className="badge badge-warning font-mono flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Medium
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            Low Priority
          </span>
        );
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 animate-spin text-indigo-500" /> In Dispatch
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5" /> Submitted
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Banner & Status Filter Pills */}
      <div className="p-4 sm:p-5 rounded-2xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-4 h-4 text-indigo-500" />
            Maintenance Ticket Queue
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time technician assignments and service requests across all properties.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            {['all', 'submitted', 'in_progress', 'resolved'].map((filter) => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs capitalize btn-press transition-all ${
                  statusFilter === filter
                    ? 'bg-brand text-brand-ink shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {filter.replace('_', ' ')}
              </button>
            ))}
          </div>

          {onOpenNewTicket && (
            <button
              type="button"
              onClick={onOpenNewTicket}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold font-grotesk btn-press flex items-center gap-1.5 shadow-sm"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>+ New Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {paginatedTickets.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 apple-glass text-slate-500 dark:text-slate-400 text-xs">
            No maintenance tickets match the active search or filter state.
          </div>
        ) : (
          paginatedTickets.map((t) => (
            <div
              key={t.id}
              className="p-5 rounded-2xl apple-glass border border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition-all top-shade shadow-xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {t.id}
                    </span>
                    {getPriorityBadge(t.priority)}
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                      Category: <strong className="text-slate-700 dark:text-slate-300">{t.category}</strong>
                    </span>
                  </div>
                  <h3 className="text-base font-bold font-grotesk text-slate-900 dark:text-white">
                    {t.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl">
                    {t.description}
                  </p>
                  {(t.entryPreference || t.entryNote || t.petsPresent) && (
                    <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface p-3 text-xs text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-800 dark:text-slate-100">Resident visit preference:</strong>{' '}
                      {t.entryPreference === 'ok_if_not_home' ? 'May be away if the visit is confirmed' : t.entryPreference === 'custom' ? 'See resident visit note' : 'Resident wants to be present'}
                      {t.entryNote && <p className="mt-1">{t.entryNote}</p>}
                      {t.petsPresent && <p className="mt-1">Pets are present in the unit.</p>}
                    </div>
                  )}
                  {t.photoUrls && t.photoUrls.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      {t.photoUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 w-14 h-14 block hover:opacity-80 transition-opacity shrink-0"
                        >
                          <img src={url} alt={`Evidence ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2 self-start">
                  {getStatusBadge(t.status)}
                  {onDeleteTicket && !isTechnician && (
                    <button
                      type="button"
                      onClick={() => setDeletingTicket(t)}
                      title="Delete ticket"
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:border-rose-500/30 btn-press transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Location, Tenant & Tech Assignment Bar */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 text-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t.propertyName} &bull; <strong className="text-slate-900 dark:text-white">{t.unitLabel}</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <User className="w-3.5 h-3.5 text-blue-500" />
                    <span>Reported by: <strong>{t.tenantName}</strong></span>
                  </div>
                </div>

                {/* Quick Status & Assign Technician Controls */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Assign Technician Input */}
                  {!isTechnician && <div className="flex items-center gap-1.5">
                    <HardHat className="w-3.5 h-3.5 text-amber-500" />
                    <select
                      value={String(t.assignedStaff?._id || t.assignedStaff || '')}
                      onChange={(event) => handleAssignTech(t.id || t._id, event.target.value)}
                      disabled={!technicians.some((tech) => (tech.propertyAssignments || []).some((property) => String(property._id || property) === String(t.propertyId)))}
                      className="bg-white dark:bg-surface-hover border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-48"
                      title="Assign an active technician account assigned to this property"
                    >
                      <option value="">{technicians.length ? 'Assign technician' : 'No active technicians'}</option>
                      {technicians.filter((tech) => (tech.propertyAssignments || []).some((property) => String(property._id || property) === String(t.propertyId))).map((tech) => <option key={tech._id || tech.id} value={tech._id || tech.id}>{tech.firstName} {tech.lastName}</option>)}
                    </select>
                  </div>}

                  {/* Status Switcher */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-mono hidden sm:inline">Status:</span>
                    <select
                      value={t.status}
                      onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                      className="bg-white dark:bg-surface-hover border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="submitted">Submitted</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Status History Logs */}
              {t.statusHistory && t.statusHistory.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Technician & Activity Log
                  </span>
                  <div className="space-y-1">
                    {t.statusHistory.slice(-2).map((h, i) => {
                      const displayName =
                        h.changedByName ||
                        (typeof h.changedBy === 'object'
                          ? `${h.changedBy.firstName || ''} ${h.changedBy.lastName || ''}`.trim() || h.changedBy.email || 'Landlord'
                          : (/^[0-9a-fA-F]{24}$/.test(h.changedBy)
                              ? (h.userRole === 'landlord' ? currentUserName : (h.userRole === 'tenant' ? (t.tenantName || 'Tenant') : 'User'))
                              : (h.changedBy || (h.userRole === 'landlord' ? currentUserName : 'User'))));

                      return (
                        <div key={i} className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                          <span>
                            <strong className="text-slate-700 dark:text-slate-300">{displayName}</strong> updated status to <span className="font-mono text-indigo-500 font-semibold">{h.status}</span> {h.note ? `— "${h.note}"` : ''}
                          </span>
                          <span className="font-mono text-xs text-slate-400 shrink-0">
                            {new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-3 rounded-2xl apple-glass border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-mono">
            Page {currentPage} of {totalPages} ({filteredTickets.length} total tickets)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 btn-press"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 btn-press"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(deletingTicket)}
        onClose={() => setDeletingTicket(null)}
        onConfirm={() => {
          if (deletingTicket && onDeleteTicket) {
            onDeleteTicket(deletingTicket.id || deletingTicket._id);
            setTickets((prev) => prev.filter((t) => (t.id !== deletingTicket.id && t._id !== deletingTicket._id)));
            toast.success(`Ticket "${deletingTicket.title || deletingTicket.id}" deleted.`);
            setDeletingTicket(null);
          }
        }}
        title="Delete Maintenance Ticket?"
        description={`Are you sure you want to delete ticket "${deletingTicket?.title || deletingTicket?.id}"? This will cancel the work request.`}
        confirmText="Delete Ticket"
        variant="danger"
      />
    </div>
  );
};
