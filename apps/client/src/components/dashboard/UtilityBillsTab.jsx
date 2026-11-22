import React, { useEffect, useState } from 'react';
import { landlordApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const UTILITIES = ['electricity', 'water', 'gas', 'internet', 'other'];
const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const field = 'mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-3 py-2 text-sm';

// Shared-meter utility billing: enter the real bill, review the split, then post one invoice per unit.
export const UtilityBillsTab = () => {
  const toast = useToast();
  const [properties, setProperties] = useState([]);
  const [bills, setBills] = useState([]);
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ propertyId: '', utilityType: 'water', periodKey: thisMonth(), totalAmount: '', sourceReference: '', splitMethod: 'equal', dueDate: '' });
  const [modeForm, setModeForm] = useState({ propertyId: '', utilityType: 'water', chargeMode: 'actual_bill' });

  const load = async () => {
    const [p, b] = await Promise.all([landlordApi.getProperties(), landlordApi.getUtilityBills()]);
    const list = p?.data || p?.properties || [];
    setProperties(Array.isArray(list) ? list : []);
    setBills(b?.data || []);
  };
  useEffect(() => { load().catch((error) => toast.error(error.message || 'Could not load utility bills')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key, fn, success) => {
    setBusy(key);
    try { await fn(); if (success) toast.success(success); await load(); }
    catch (error) { toast.error(error.message || 'Something went wrong'); }
    finally { setBusy(''); }
  };

  const createDraft = (event) => {
    event.preventDefault();
    run('create', () => landlordApi.createUtilityBill({ ...form, totalAmount: Number(form.totalAmount) }), 'Draft created. Review the split, then post it.');
  };
  const adjust = (bill, allocation) => {
    const amount = window.prompt(`New amount for ${allocation.unitLabel}:`, allocation.amount);
    if (amount == null) return;
    const note = window.prompt('Reason for the adjustment:');
    if (!note) return;
    run(`adj-${allocation.id}`, () => landlordApi.adjustUtilityAllocation(bill.id, allocation.id, { amount: Number(amount), note }), 'Allocation updated.');
  };
  const voidBill = (bill) => {
    const reason = window.prompt('Why are you voiding this bill? Tenants with posted invoices will see this.');
    if (!reason) return;
    run(`void-${bill.id}`, () => landlordApi.voidUtilityBill(bill.id, reason), 'Bill voided.');
  };

  const propertyOptions = properties.map((p) => <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-5 space-y-3">
        <div>
          <h3 className="font-bold">How shared utilities are charged</h3>
          <p className="text-sm text-slate-500">"Fixed in rent" adds each unit's monthly share to its rent invoice. "Actual bill" charges units only from bills you post here, so the same utility is never charged both ways.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); run('mode', async () => { const r = await landlordApi.setUtilityChargeMode(modeForm); toast.success(`${r?.data?.updated ?? 0} unit setting(s) updated.`); }); }} className="grid gap-3 sm:grid-cols-4 items-end">
          <label className="text-xs font-semibold">Property<select required value={modeForm.propertyId} onChange={(e) => setModeForm({ ...modeForm, propertyId: e.target.value })} className={field}><option value="">Select</option>{propertyOptions}</select></label>
          <label className="text-xs font-semibold">Utility<select value={modeForm.utilityType} onChange={(e) => setModeForm({ ...modeForm, utilityType: e.target.value })} className={field}>{UTILITIES.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
          <label className="text-xs font-semibold">Charge mode<select value={modeForm.chargeMode} onChange={(e) => setModeForm({ ...modeForm, chargeMode: e.target.value })} className={field}><option value="actual_bill">Actual bill</option><option value="fixed_in_rent">Fixed in rent</option></select></label>
          <button disabled={busy === 'mode'} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">Apply</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-5 space-y-3">
        <h3 className="font-bold">Enter a source bill</h3>
        <form onSubmit={createDraft} className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold">Property<select required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className={field}><option value="">Select</option>{propertyOptions}</select></label>
          <label className="text-xs font-semibold">Utility<select value={form.utilityType} onChange={(e) => setForm({ ...form, utilityType: e.target.value })} className={field}>{UTILITIES.map((u) => <option key={u} value={u}>{u}</option>)}</select></label>
          <label className="text-xs font-semibold">Billing month<input required type="month" value={form.periodKey} onChange={(e) => setForm({ ...form, periodKey: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold">Bill total (₱)<input required type="number" min="0.01" step="0.01" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold">Split<select value={form.splitMethod} onChange={(e) => setForm({ ...form, splitMethod: e.target.value })} className={field}><option value="equal">Equally between units</option><option value="by_share">By each unit's share setting</option></select></label>
          <label className="text-xs font-semibold">Due date<input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={field} /></label>
          <label className="text-xs font-semibold sm:col-span-2">Bill / account reference<input maxLength={120} value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} className={field} placeholder="e.g. Maynilad SOA 2026-11-0042" /></label>
          <div className="flex items-end"><button disabled={busy === 'create'} className="btn btn-primary w-full text-sm">Create draft</button></div>
        </form>
      </section>

      <section className="space-y-3">
        {bills.length === 0 && <p className="text-sm text-slate-500">No utility bills yet.</p>}
        {bills.map((bill) => (
          <article key={bill.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="capitalize">{bill.utilityType}</b> · {bill.periodName} · {bill.propertyName}
                <p className="text-xs text-slate-500">Total {peso(bill.totalAmount)} · allocated {peso(bill.allocatedAmount)} {bill.reconciled ? '· reconciled' : <span className="text-rose-600">· does not match total</span>}{bill.sourceReference ? ` · ref ${bill.sourceReference}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${bill.status === 'posted' ? 'bg-emerald-500/10 text-emerald-600' : bill.status === 'void' ? 'bg-slate-500/10 text-slate-500' : 'bg-amber-500/10 text-amber-600'}`}>{bill.status}</span>
                {bill.status === 'draft' && <button disabled={!bill.reconciled || busy === `post-${bill.id}`} onClick={() => run(`post-${bill.id}`, () => landlordApi.postUtilityBill(bill.id), 'Bill posted. Tenants were notified.')} className="btn btn-primary text-xs">Post invoices</button>}
                {bill.status !== 'void' && <button disabled={busy === `void-${bill.id}`} onClick={() => voidBill(bill)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">Void</button>}
              </div>
            </div>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {bill.allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1.5">
                  <span>{a.unitLabel}{bill.splitMethod === 'by_share' ? <span className="text-xs text-slate-500"> · share {a.weight}</span> : null}</span>
                  <span className="flex items-center gap-2">{peso(a.amount)}{a.paymentId && <span className="text-xs text-emerald-600">invoiced</span>}{bill.status === 'draft' && <button onClick={() => adjust(bill, a)} disabled={busy === `adj-${a.id}`} className="rounded border px-2 py-0.5 text-xs">Adjust</button>}</span>
                </li>
              ))}
            </ul>
            {bill.voidReason && <p className="text-xs text-slate-500">Voided: {bill.voidReason}</p>}
          </article>
        ))}
      </section>
    </div>
  );
};
