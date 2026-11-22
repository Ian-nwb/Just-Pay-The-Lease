import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, FileSpreadsheet, Users, Wrench, Droplets, ReceiptText } from 'lucide-react';
import { landlordApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);

const EXPORTS = [
  { key: 'rent-roll', title: 'Rent roll & income ledger', body: 'Every invoice with billed, paid and outstanding amounts, payment method, reference and receipt number.', icon: ReceiptText, usesMonth: true },
  { key: 'income-summary', title: 'Monthly income summary', body: 'Rent and utilities billed, collected and outstanding per property, with a total row.', icon: FileSpreadsheet, usesMonth: true },
  { key: 'tenants', title: 'Tenant directory', body: 'Residents with unit, rent, lease dates and deposit. Phone numbers respect each tenant’s privacy setting.', icon: Users, usesMonth: false },
  { key: 'maintenance', title: 'Maintenance tickets', body: 'Requests opened in the month with category, priority, status, technician and resolution date.', icon: Wrench, usesMonth: true },
  { key: 'utility-bills', title: 'Utility bills', body: 'Shared-meter source bills and each unit’s share for the month.', icon: Droplets, usesMonth: true },
];

const COLS = [
  ['rentBilled', 'Rent billed'], ['rentCollected', 'Rent collected'], ['rentOutstanding', 'Rent outstanding'],
  ['utilitiesBilled', 'Utilities billed'], ['utilitiesCollected', 'Utilities collected'], ['collectedInMonth', 'Cash received'],
];

export const ReportsTab = ({ properties = [] }) => {
  const toast = useToast();
  const [month, setMonth] = useState(thisMonth());
  const [propertyId, setPropertyId] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    landlordApi.getIncomeSummary({ month, propertyId })
      .then((res) => { if (active) setSummary(res.data); })
      .catch((error) => toast.error(error.message || 'Could not load the income summary'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async (report, usesMonth) => {
    setDownloading(report);
    try {
      const { blob, filename } = await landlordApi.downloadReport(report, { month: usesMonth ? month : '', propertyId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (error) {
      toast.error(error.message || 'Could not download the report');
    } finally {
      setDownloading('');
    }
  };

  const totals = summary?.totals || {};
  const collectionRate = totals.rentBilled ? Math.round((totals.rentCollected / totals.rentBilled) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">Reports</h1>
          <p className="mt-1 text-sm text-ink-muted">Income by property and downloadable records for your books and accountant.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-medium text-ink-soft">Month
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className="mt-1 block rounded-lg border px-3 py-2 text-sm" />
          </label>
          <label className="text-xs font-medium text-ink-soft">Property
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-1 block min-w-48 rounded-lg border px-3 py-2 text-sm">
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Headline figures for the month */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Rent billed', peso(totals.rentBilled)],
          ['Collected', peso((totals.rentCollected || 0) + (totals.utilitiesCollected || 0))],
          ['Outstanding', peso((totals.rentOutstanding || 0) + (totals.utilitiesOutstanding || 0))],
        ].map(([label, value], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3, ease: [0.23, 1, 0.32, 1] }} className="card p-5">
            <p className="text-sm text-ink-muted">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${label === 'Outstanding' && value !== peso(0) ? 'text-warning-ink' : 'text-ink-strong'}`}>{loading ? '—' : value}</p>
            {label === 'Collected' && collectionRate != null && !loading && <p className="mt-1 text-xs text-ink-muted">{collectionRate}% of rent billed</p>}
          </motion.div>
        ))}
      </div>

      {/* Per-property summary */}
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-semibold text-ink-strong">Income by property</h2>
          <button type="button" onClick={() => download('income-summary', true)} disabled={downloading === 'income-summary'} className="btn btn-secondary btn-sm"><Download size={14} /> CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-5 py-2.5 font-medium">Property</th>
                {COLS.map(([, h]) => <th key={h} className="px-3 py-2.5 text-right font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={COLS.length + 1} className="px-5 py-8 text-center text-ink-muted">Loading…</td></tr>}
              {!loading && summary?.rows?.map((r) => (
                <tr key={r.propertyId} className="border-t border-line hover:bg-surface-hover">
                  <td className="px-5 py-2.5 font-medium text-ink">{r.property}</td>
                  {COLS.map(([k]) => <td key={k} className={`px-3 py-2.5 text-right tabular-nums ${k.includes('Outstanding') && r[k] > 0 ? 'text-warning-ink' : 'text-ink'}`}>{peso(r[k])}</td>)}
                </tr>
              ))}
              {!loading && summary?.rows?.length > 0 && (
                <tr className="border-t-2 border-line-strong font-semibold">
                  <td className="px-5 py-2.5 text-ink-strong">Total</td>
                  {COLS.map(([k]) => <td key={k} className="px-3 py-2.5 text-right tabular-nums text-ink-strong">{peso(totals[k])}</td>)}
                </tr>
              )}
              {!loading && !summary?.rows?.length && <tr><td colSpan={COLS.length + 1} className="px-5 py-8 text-center text-ink-muted">No properties to report on.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">Billed and outstanding use invoices due in the month. “Cash received” counts confirmed payments dated in the month, including late payments on earlier invoices.</p>
      </section>

      {/* Exports */}
      <section>
        <h2 className="mb-3 font-semibold text-ink-strong">Exports</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {EXPORTS.map((x) => (
            <div key={x.key} className="card flex items-start justify-between gap-4 p-4">
              <div className="flex gap-3">
                <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
                <div>
                  <p className="font-medium text-ink">{x.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{x.body}</p>
                  <p className="mt-1 text-[11px] text-ink-muted">{x.usesMonth ? `Filtered to ${month}` : 'Current residents'}{propertyId ? ' · selected property' : ' · all properties'}</p>
                </div>
              </div>
              <button type="button" onClick={() => download(x.key, x.usesMonth)} disabled={downloading === x.key} className="btn btn-secondary btn-sm shrink-0">
                <Download size={14} /> {downloading === x.key ? 'Preparing…' : 'CSV'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
