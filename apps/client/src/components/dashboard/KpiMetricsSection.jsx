import React from 'react';
import { ArrowUpRight, Wrench } from 'lucide-react';
import { formatPhp } from '../../utils/currency';

export const KpiMetricsSection = ({ units = [], tickets = [], onAddTenant, onNavigateTickets }) => {
  const totalUnits = units.length;
  const occupiedUnits = units.filter((unit) => unit.status === 'occupied').length;
  const vacantUnits = units.filter((unit) => unit.status === 'vacant').length;
  const occupancyPercentage = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const scheduledRent = units
    .filter((unit) => unit.status === 'occupied')
    .reduce((sum, unit) => sum + (Number(unit.monthlyRent) || 0), 0);
  const openTickets = tickets.filter((ticket) => ticket.status !== 'resolved').length;

  return (
    <section aria-label="Portfolio overview" className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
        <div className="p-4 sm:p-5">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Scheduled monthly rent</p>
          <p className="mt-2 text-2xl sm:text-3xl font-bold font-grotesk tabular-nums text-slate-900 dark:text-white">{formatPhp(scheduledRent)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Across {occupiedUnits} occupied {occupiedUnits === 1 ? 'unit' : 'units'}</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Occupancy</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-grotesk tabular-nums text-slate-900 dark:text-white">{occupancyPercentage}%</p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-right">{occupiedUnits} of {totalUnits}<br />units occupied</p>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" role="progressbar" aria-label="Occupied units" aria-valuemin={0} aria-valuemax={totalUnits || 1} aria-valuenow={occupiedUnits}>
            <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${occupancyPercentage}%` }} />
          </div>
        </div>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Needs attention</p>
            <p className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl font-bold font-grotesk tabular-nums text-slate-900 dark:text-white">
              <Wrench className="w-5 h-5 text-amber-500" aria-hidden="true" /> {openTickets}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{vacantUnits} vacant {vacantUnits === 1 ? 'unit' : 'units'} · {openTickets} open {openTickets === 1 ? 'request' : 'requests'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {vacantUnits > 0 && <button type="button" onClick={onAddTenant} className="btn btn-primary min-h-10 inline-flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0E10]">
              Assign tenant <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>}
            {openTickets > 0 && <button type="button" onClick={onNavigateTickets} className="min-h-10 px-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded">
              Review requests
            </button>}
          </div>
        </div>
      </div>
    </section>
  );
};
