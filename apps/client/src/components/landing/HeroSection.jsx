import React from 'react';
import { ArrowRight, Wrench, ChevronDown } from 'lucide-react';

const KPIS = [
  { label: 'Occupancy rate', value: '96.4%', note: '23 of 24 units leased', tone: 'positive' },
  { label: 'Collected this month', value: '₱482,500', note: 'All invoices paid on time', tone: 'positive' },
  { label: 'Maintenance', value: '3 open', note: '1 due today', tone: 'attention' },
];

const COLLECTION = [
  { name: 'Aura Sky Towers', paid: 100 },
  { name: 'Vantro Lofts', paid: 92 },
  { name: 'Lumina Green Park', paid: 78 },
];

const TICKETS = [
  { id: '#409', title: 'Kitchen faucet leak', unit: 'Unit 14B', who: 'Assigned to plumber', status: 'In progress', tone: 'attention' },
  { id: '#408', title: 'HVAC inspection', unit: 'Unit 4A', who: 'Ramon Cruz', status: 'Resolved', tone: 'positive' },
  { id: '#410', title: 'Hallway light flickering', unit: 'Loft 304', who: 'Awaiting assignment', status: 'Submitted', tone: 'neutral' },
];

const pill = {
  positive: 'bg-[#ECFDF5] text-[var(--l-positive-ink)] border-[#A7F3D0] dark:bg-[#052E1C] dark:border-[#065F46]',
  attention: 'bg-[#FFFBEB] text-[var(--l-attention-ink)] border-[#FDE68A] dark:bg-[#2A1A05] dark:border-[#78350F]',
  neutral: 'bg-[var(--l-bg)] text-[var(--l-muted)] border-[var(--l-line)]',
};

const DashboardPreview = () => (
  <div className="relative rounded-xl border border-[var(--l-line)] bg-[var(--l-card)] [box-shadow:var(--l-shadow)] overflow-hidden" aria-label="Example JPTL landlord dashboard" role="img">
    {/* Workspace header */}
    <div className="flex items-center justify-between gap-3 border-b border-[var(--l-line)] px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--l-ink)] truncate">Portfolio overview</p>
        <p className="text-xs text-[var(--l-faint)]">5 properties · Metro Manila</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-md border border-[var(--l-line)] px-2.5 py-1 text-xs text-[var(--l-ink-soft)]">
        November 2026 <ChevronDown className="h-3 w-3" />
      </span>
    </div>

    {/* KPIs */}
    <div className="grid grid-cols-1 divide-y divide-[var(--l-line)] border-b border-[var(--l-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {KPIS.map((k) => (
        <div key={k.label} className="min-w-0 px-5 py-4 max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4">
          <p className="text-xs text-[var(--l-muted)] sm:truncate">{k.label}</p>
          <p className={`mt-1.5 font-grotesk text-[26px] font-semibold leading-none tracking-tight tabular-nums ${k.tone === 'positive' ? 'text-[var(--l-positive)]' : 'text-[var(--l-attention)]'}`}>{k.value}</p>
          <p className="mt-2 text-xs text-[var(--l-faint)] truncate max-sm:hidden">{k.note}</p>
        </div>
      ))}
    </div>

    {/* Rent collection by property */}
    <div className="border-b border-[var(--l-line)] px-5 py-4">
      <p className="text-xs font-medium text-[var(--l-ink-soft)]">Rent collected by property</p>
      <div className="mt-3 space-y-2.5">
        {COLLECTION.map((p) => (
          <div key={p.name} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-xs sm:grid-cols-[8.5rem_1fr_2.5rem]">
            <span className="truncate text-[var(--l-muted)]">{p.name}</span>
            <span className="h-1.5 rounded-full bg-[var(--l-line-soft)] overflow-hidden">
              <span className="block h-full rounded-full bg-[var(--l-positive)]" style={{ width: `${p.paid}%` }} />
            </span>
            <span className="text-right tabular-nums text-[var(--l-ink-soft)]">{p.paid}%</span>
          </div>
        ))}
      </div>
    </div>

    {/* Maintenance feed */}
    <div className="px-5 py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[var(--l-ink-soft)]">Maintenance requests</p>
        <Wrench className="h-3.5 w-3.5 text-[var(--l-faint)]" />
      </div>
      <ul className="mt-2 divide-y divide-[var(--l-line)]">
        {TICKETS.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] text-[var(--l-ink)] truncate"><span className="mr-1.5 tabular-nums text-[var(--l-faint)]">{t.id}</span>{t.title}</p>
              <p className="text-xs text-[var(--l-faint)] truncate">{t.unit} · {t.who}</p>
            </div>
            <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${pill[t.tone]}`}>{t.status}</span>
          </li>
        ))}
      </ul>
    </div>
  </div>
);

export const HeroSection = ({ onGetStarted = () => {}, onResidentPortal = () => {} }) => (
  <section className="relative overflow-hidden border-b border-[var(--l-line)]">
    <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
    <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 lg:px-8 lg:pt-24 lg:pb-28">
      {/* Copy & actions */}
      <div className="max-w-xl">
        <h1 className="landing-rise font-grotesk text-[clamp(2.5rem,5.2vw,4.25rem)] font-semibold leading-[1.04] tracking-tight text-[var(--l-ink)] [text-wrap:balance]">
          Run every lease, rent cycle and repair from one place.
        </h1>
        <p className="landing-rise mt-6 max-w-[34rem] text-lg leading-relaxed text-[var(--l-muted)]" style={{ animationDelay: '80ms' }}>
          JPTL gives landlords a live view of occupancy, rent collected and open repairs, and gives residents one portal to pay, sign and report issues.
        </p>
        <div className="landing-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '160ms' }}>
          <button type="button" onClick={onGetStarted} className="l-btn l-btn-primary">
            Get started <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={onResidentPortal} className="l-btn l-btn-secondary">
            Resident portal
          </button>
        </div>
        <dl className="landing-rise mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-[var(--l-line)] pt-6" style={{ animationDelay: '240ms' }}>
          {[['Rent', 'Invoices, receipts & partial payments'], ['Leases', 'Renewals, signatures & move-outs'], ['Repairs', 'Tickets routed to your technicians']].map(([term, desc]) => (
            <div key={term}>
              <dt className="text-sm font-semibold text-[var(--l-ink)]">{term}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-[var(--l-faint)]">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Product preview: bleeds past the column edge on large screens */}
      <div className="landing-rise lg:-mr-4 xl:-mr-10" style={{ animationDelay: '200ms' }}>
        <DashboardPreview />
      </div>
    </div>
  </section>
);
