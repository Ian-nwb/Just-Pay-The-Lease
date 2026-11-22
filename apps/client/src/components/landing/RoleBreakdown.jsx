import React, { useState } from 'react';
import { Building2, Smartphone, Wrench, Check, ArrowRight } from 'lucide-react';

const ROLES = [
  {
    id: 'landlord',
    label: 'Landlords',
    icon: Building2,
    title: 'See every property, unit and peso in one console.',
    points: [
      'Rent roll with paid, partial and overdue invoices',
      'Approve transfer receipts and record onsite payments',
      'Leases, renewals and move-outs with full history',
      'Utility bills split from the actual meter bill',
    ],
    preview: {
      heading: 'Rent roll · November 2026',
      rows: [
        ['Unit 14B · Sophia Lim', '₱50,000', 'Paid', 'positive'],
        ['Loft 304 · Liam Carter', '₱12,000 due', 'Partial', 'attention'],
        ['Apt 2A · Miguel Reyes', '₱18,000', 'Overdue', 'danger'],
      ],
    },
  },
  {
    id: 'resident',
    label: 'Residents',
    icon: Smartphone,
    title: 'Pay, sign and report a repair from a phone.',
    points: [
      'Pay rent by QR, bank or e-wallet and upload the receipt',
      'Request a repair with photos and track its status',
      'Read and sign the lease, building rules and notices',
      'Ask for a renewal or an IOU without a phone call',
    ],
    preview: {
      heading: 'Unit 14B · Aura Sky Towers',
      rows: [
        ['December rent', '₱50,000 due Dec 5', 'Upcoming', 'neutral'],
        ['Aircon not cooling', 'Technician today, 3 PM', 'In progress', 'attention'],
        ['Lease renewal', 'Window opens Nov 15', 'Open', 'positive'],
      ],
    },
  },
  {
    id: 'staff',
    label: 'Property staff',
    icon: Wrench,
    title: 'Give managers and technicians only what they need.',
    points: [
      'Property managers see their assigned buildings only',
      'Technicians see the tickets assigned to them',
      'Messages stay with the property when staff change',
      'Every action is recorded in the audit trail',
    ],
    preview: {
      heading: 'Ramon Cruz · Technician',
      rows: [
        ['#409 Kitchen faucet leak', 'Unit 14B', 'Today', 'attention'],
        ['#412 Door lock replacement', 'Apt 2B', 'Tomorrow', 'neutral'],
        ['#408 HVAC inspection', 'Unit 4A', 'Done', 'positive'],
      ],
    },
  },
];

const TONE = {
  positive: 'text-[var(--l-positive-ink)] bg-[#ECFDF5] border-[#A7F3D0] dark:bg-[#052E1C] dark:border-[#065F46]',
  attention: 'text-[var(--l-attention-ink)] bg-[#FFFBEB] border-[#FDE68A] dark:bg-[#2A1A05] dark:border-[#78350F]',
  danger: 'text-[#B91C1C] bg-[#FEF2F2] border-[#FECACA] dark:text-[#F87171] dark:bg-[#2A0A0A] dark:border-[#7F1D1D]',
  neutral: 'text-[var(--l-muted)] bg-[var(--l-bg)] border-[var(--l-line)]',
};

export const RoleBreakdown = ({ onOpenLogin = () => {} }) => {
  const [active, setActive] = useState(0);
  const role = ROLES[active];

  return (
    <section id="roles" className="border-b border-[var(--l-line)] py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="font-grotesk text-3xl font-semibold tracking-tight text-[var(--l-ink)] sm:text-4xl [text-wrap:balance]">
            One system, a view for everyone who runs the building.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--l-muted)]">
            Each person signs in to the tools for their job, and only sees the properties and records they are responsible for.
          </p>
        </div>

        <div role="tablist" aria-label="Roles" className="mt-10 inline-flex rounded-lg border border-[var(--l-line)] bg-[var(--l-card)] p-1">
          {ROLES.map((r, i) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${i === active ? 'bg-[var(--l-primary)] text-[var(--l-primary-ink)]' : 'text-[var(--l-muted)] hover:text-[var(--l-ink)]'}`}
            >
              <r.icon className="h-4 w-4" /> {r.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="mt-8 grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="font-grotesk text-2xl font-semibold tracking-tight text-[var(--l-ink)]">{role.title}</h3>
            <ul className="mt-6 space-y-3.5">
              {role.points.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] leading-relaxed text-[var(--l-ink-soft)]">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--l-positive)]" /> {p}
                </li>
              ))}
            </ul>
            <button type="button" onClick={onOpenLogin} className="l-btn l-btn-secondary mt-8">
              Start with a free Starter plan <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-[var(--l-line)] bg-[var(--l-card)] [box-shadow:var(--l-shadow)]">
            <p className="border-b border-[var(--l-line)] px-5 py-3.5 text-[13px] font-semibold text-[var(--l-ink)]">{role.preview.heading}</p>
            <ul className="divide-y divide-[var(--l-line)]">
              {role.preview.rows.map(([main, sub, status, tone]) => (
                <li key={main} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--l-ink)]">{main}</p>
                    <p className="truncate text-xs text-[var(--l-faint)]">{sub}</p>
                  </div>
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>{status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
