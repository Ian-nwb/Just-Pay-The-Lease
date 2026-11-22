import React, { useMemo, useState } from 'react';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { staffApi } from '../../services/api';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export function StaffTenantRequestPage({ properties = [], units = [], onSubmitted }) {
  const availableUnits = useMemo(() => units.filter((unit) => unit.status === 'vacant' && unit.isActive !== false), [units]);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', unitId: '', leaseStart: today(), leaseType: 'fixed_term', leaseEnd: '', monthlyRent: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const selectedUnit = availableUnits.find((unit) => String(unit._id || unit.id) === String(form.unitId));

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (!form.unitId) throw new Error('Select a vacant unit.');
      if (!form.leaseStart) throw new Error('Lease start date is required.');
      if (form.leaseType === 'fixed_term' && (!form.leaseEnd || form.leaseEnd <= form.leaseStart)) throw new Error('Enter a lease end date after the start date.');
      const response = await staffApi.createTenantRequest({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        unitId: form.unitId,
        monthlyRent: Number(form.monthlyRent || selectedUnit?.monthlyRent || 0),
        leaseStart: form.leaseStart,
        leaseType: form.leaseType,
        leaseEnd: form.leaseType === 'fixed_term' ? form.leaseEnd : undefined,
      });
      setSuccess(response.message || 'Tenant request sent to the landlord for approval.');
      setForm({ firstName: '', lastName: '', email: '', phone: '', unitId: '', leaseStart: today(), leaseType: 'fixed_term', leaseEnd: '', monthlyRent: '' });
      onSubmitted?.();
    } catch (requestError) {
      setError(requestError.message || 'Could not submit tenant request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-surface">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-500/10 p-3 text-indigo-500"><UserPlus size={20} /></span><div><h2 className="text-xl font-bold">Request tenant account</h2><p className="mt-1 text-sm text-slate-500">This request does not reserve the unit. The landlord must approve the tenant and confirm the unit is still vacant before resident access begins.</p></div></div>
      </header>
      <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:grid-cols-2 dark:border-slate-800 dark:bg-surface">
        <label className="text-sm font-medium">First name<input required maxLength={50} value={form.firstName} onChange={(event) => update('firstName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        <label className="text-sm font-medium">Last name<input required maxLength={50} value={form.lastName} onChange={(event) => update('lastName', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        <label className="text-sm font-medium">Email<input required type="email" maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        <label className="text-sm font-medium">Phone (optional)<input type="tel" maxLength={30} value={form.phone} onChange={(event) => update('phone', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        <label className="text-sm font-medium sm:col-span-2">Vacant unit<select required value={form.unitId} onChange={(event) => { const unit = availableUnits.find((entry) => String(entry._id || entry.id) === event.target.value); update('unitId', event.target.value); update('monthlyRent', unit?.monthlyRent ? String(unit.monthlyRent) : ''); }} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"><option value="">Select a unit</option>{availableUnits.map((unit) => { const property = properties.find((entry) => String(entry._id || entry.id) === String(unit.propertyId || unit.property)); return <option key={unit._id || unit.id} value={unit._id || unit.id}>{property?.name || unit.propertyName || 'Property'} · {unit.label} · ₱{unit.monthlyRent}/mo</option>; })}</select>{availableUnits.length === 0 && <span className="mt-1 block text-xs text-amber-600">There are no vacant units in your assigned properties.</span>}</label>
        <label className="text-sm font-medium">Monthly rent (₱)<input required type="number" min="0" step="0.01" value={form.monthlyRent || selectedUnit?.monthlyRent || ''} onChange={(event) => update('monthlyRent', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        <label className="text-sm font-medium">Lease type<select value={form.leaseType} onChange={(event) => update('leaseType', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700"><option value="fixed_term">Fixed term</option><option value="indefinite">Indefinite</option></select></label>
        <label className="text-sm font-medium">Lease start<input required type="date" value={form.leaseStart} onChange={(event) => update('leaseStart', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>
        {form.leaseType === 'fixed_term' && <label className="text-sm font-medium">Lease end<input required type="date" min={form.leaseStart} value={form.leaseEnd} onChange={(event) => update('leaseEnd', event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-700" /></label>}
        {error && <p role="alert" className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
        {success && <p role="status" className="flex items-center gap-2 text-sm text-emerald-600 sm:col-span-2"><CheckCircle2 size={17} />{success}</p>}
        <button disabled={busy || !availableUnits.length} className="btn btn-primary text-sm sm:col-span-2">{busy ? 'Sending request…' : 'Send to landlord for approval'}</button>
      </form>
    </section>
  );
}
