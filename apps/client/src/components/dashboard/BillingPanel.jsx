import React, { useEffect, useState } from 'react';
import { billingApi } from '../../services/api';

const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const field = 'mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-3 py-2 text-sm';
const card = 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-6 space-y-3 text-sm';

// Landlord: JPTL subscription (Professional) and payouts of QR Ph rent.
// Each part shows only what the server reports as configured.
export const BillingPanel = () => {
  const [config, setConfig] = useState(null);
  const [sub, setSub] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [account, setAccount] = useState({ channel: 'bank', institutionCode: '', institutionName: '', accountName: '', accountNumber: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const cfg = (await billingApi.getConfig()).data;
    setConfig(cfg);
    setSub((await billingApi.getSubscription()).data);
    if (cfg.payouts || cfg.qrph) setPayouts((await billingApi.getPayouts()).data);
  };
  useEffect(() => { load().catch((e) => setError(e.message || 'Could not load billing.')); }, []);

  const run = async (key, fn) => {
    setError(''); setBusy(key);
    try { await fn(); } catch (e) { setError(e.message || 'Something went wrong.'); } finally { setBusy(''); }
  };

  if (!config || !sub) return <div className={card}>{error ? <p className="text-rose-600">{error}</p> : <p className="text-slate-500">Loading billing…</p>}</div>;

  const isPro = sub.plan === 'pro';
  return (
    <div className="space-y-6">
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <section className={card}>
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">JPTL plan</h2>
        <p>Current plan: <b>{isPro ? 'Professional' : 'Starter'}</b>{sub.status === 'active' && ` · paid through ${when(sub.currentPeriodEnd)}`}{sub.status === 'past_due' && <span className="text-amber-600"> · payment due, Professional limits kept until {when(sub.graceEndsAt)}</span>}</p>
        <p className="text-slate-500">Professional is {peso(sub.price)} per 30 days: up to 10 properties and 20 units. This is your JPTL subscription, separate from the rent your tenants pay you.</p>
        {!sub.enabled ? (
          <p className="rounded-xl bg-slate-50 dark:bg-surface border border-slate-200 dark:border-slate-800 p-3 text-slate-600 dark:text-slate-300">Online plan payments are not connected yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button disabled={busy === 'checkout'} onClick={() => run('checkout', async () => { const r = await billingApi.startCheckout(); if (r.data?.checkoutUrl) window.location.assign(r.data.checkoutUrl); })} className="btn btn-primary text-xs">
              {isPro ? (sub.status === 'past_due' ? 'Pay now' : 'Pay for next 30 days') : 'Upgrade to Professional'}
            </button>
            {isPro && sub.status === 'active' && (
              <button disabled={busy === 'cancel'} onClick={() => run('cancel', async () => setSub((await billingApi.setCancel(!sub.cancelAtPeriodEnd)).data))} className="btn btn-secondary border text-xs">
                {sub.cancelAtPeriodEnd ? 'Keep Professional' : 'Cancel at period end'}
              </button>
            )}
          </div>
        )}
        {sub.history?.length > 0 && (
          <table className="w-full text-xs mt-2">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Date</th><th>Amount</th><th>Status</th><th>Period</th></tr></thead>
            <tbody>{sub.history.map((h) => <tr key={h.id} className="border-t border-slate-200 dark:border-slate-800"><td className="py-1.5">{when(h.paidAt || h.createdAt)}</td><td>{peso(h.amount)}</td><td className="capitalize">{h.status}</td><td>{h.periodStart ? `${when(h.periodStart)} – ${when(h.periodEnd)}` : '—'}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {(config.qrph || config.payouts) && payouts && (
        <section className={card}>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Rent payouts</h2>
          <p className="text-slate-500">Rent that tenants pay by QR Ph goes to JPTL's PayMongo account first, then is paid out to your account. Manual receipts and onsite payments are not included.</p>
          <p>Available to pay out: <b>{peso(payouts.availableAmount)}</b> from {payouts.availableCount} payment{payouts.availableCount === 1 ? '' : 's'}</p>
          {payouts.account && <p className="text-slate-500">Payout account: {payouts.account.institutionName} · {payouts.account.accountName} ••{payouts.account.accountNumberLast4}</p>}
          <form onSubmit={(e) => { e.preventDefault(); run('account', async () => { setPayouts((await billingApi.savePayoutAccount(account)).data); setAccount({ ...account, accountNumber: '' }); }); }} className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Type<select value={account.channel} onChange={(e) => setAccount({ ...account, channel: e.target.value })} className={field}><option value="bank">Bank</option><option value="ewallet">E-wallet</option></select></label>
            <label className="text-xs font-semibold">Bank / e-wallet name<input required value={account.institutionName} onChange={(e) => setAccount({ ...account, institutionName: e.target.value })} className={field} /></label>
            <label className="text-xs font-semibold">Institution code<input required value={account.institutionCode} onChange={(e) => setAccount({ ...account, institutionCode: e.target.value })} className={field} placeholder="From PayMongo's institution list" /></label>
            <label className="text-xs font-semibold">Account name<input required value={account.accountName} onChange={(e) => setAccount({ ...account, accountName: e.target.value })} className={field} /></label>
            <label className="text-xs font-semibold sm:col-span-2">Account / mobile number<input required inputMode="numeric" value={account.accountNumber} onChange={(e) => setAccount({ ...account, accountNumber: e.target.value })} className={`${field} font-mono`} /></label>
            <div><button disabled={busy === 'account'} className="rounded-xl border px-4 py-2 text-xs font-semibold disabled:opacity-50">{payouts.account ? 'Replace payout account' : 'Save payout account'}</button></div>
          </form>
          {config.payouts ? (
            <button disabled={busy === 'payout' || !payouts.account || payouts.availableAmount <= 0} onClick={() => run('payout', async () => setPayouts((await billingApi.requestPayout()).data))} className="btn btn-primary text-xs">Request payout</button>
          ) : (
            <p className="text-xs text-slate-500">Automatic payouts are not turned on yet.</p>
          )}
          {payouts.payouts?.length > 0 && (
            <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">{payouts.payouts.map((p) => <li key={p.id} className="py-1.5 flex justify-between"><span>{when(p.createdAt)} · {peso(p.amount)}</span><span className="capitalize">{p.status}{p.failureReason ? `: ${p.failureReason}` : ''}</span></li>)}</ul>
          )}
        </section>
      )}
    </div>
  );
};
