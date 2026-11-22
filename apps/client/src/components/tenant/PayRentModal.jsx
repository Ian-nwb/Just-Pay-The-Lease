import React, { useEffect, useState } from 'react';
import { X, Upload, Building2, Clock3, Wallet } from 'lucide-react';
import { tenantApi, billingApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const PayRentModal = ({ isOpen, onClose, payment, unit, tenant, onPaymentSubmitted = () => {}, onDraftDiscarded = () => {} }) => {
  const toast = useToast();
  const [options, setOptions] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [channel, setChannel] = useState('qr_transfer');
  const [submittedAmount, setSubmittedAmount] = useState('');
  // QR Ph through PayMongo: shown only when the server has it enabled. Paid only on PayMongo's confirmation.
  const [qrphEnabled, setQrphEnabled] = useState(false);
  const [qrph, setQrph] = useState(null); // { collectionId, qrImageUrl, amount, status }

  useEffect(() => {
    if (!isOpen) return;
    setQrph(null);
    billingApi.getConfig().then((res) => setQrphEnabled(Boolean(res.data?.qrph))).catch(() => setQrphEnabled(false));
  }, [isOpen]);

  useEffect(() => {
    if (!qrph?.collectionId || qrph.status === 'paid') return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await billingApi.getQrPhStatus(qrph.collectionId);
        if (res.data?.status && res.data.status !== qrph.status) {
          setQrph((q) => ({ ...q, status: res.data.status }));
          if (res.data.status === 'paid') { toast.success('Payment received.'); onPaymentSubmitted(); }
        }
      } catch { /* keep polling */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [qrph?.collectionId, qrph?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startQrph = async () => {
    setBusy(true);
    try {
      const res = await billingApi.createQrPh(payment?.id || payment?._id);
      setQrph({ ...res.data, status: 'awaiting_payment' });
    } catch (error) { toast.error(error.message || 'Could not create a QR Ph code'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSubmitted(false); setReceipt(null); setReference(''); setNote(''); setSelectedId('');
    setSubmittedAmount(String(Math.max(0, Number(payment?.outstandingBalance ?? payment?.amount ?? 0) - Number(payment?.paidAmount || 0))));
    tenantApi.getPaymentOptions().then((res) => {
      const list = Array.isArray(res?.data) ? res.data : [];
      setOptions(list);
      setSelectedId(list[0]?.id || '');
      setChannel(list[0]?.optionType === 'bank_account' ? 'bank_transfer' : list[0]?.optionType === 'ewallet' ? 'ewallet_transfer' : 'qr_transfer');
    }).catch((error) => toast.error(error.message || 'Could not load payment options'));
  }, [isOpen]);

  if (!isOpen) return null;
  const selected = options.find((option) => String(option.id) === String(selectedId));
  const amount = Number(payment?.amount || 0);
  const outstanding = Number(payment?.outstandingBalance ?? Math.max(0, amount - Number(payment?.paidAmount || 0)));
  const close = async () => {
    if (!submitted && payment?.isAdvancePayment && payment?.status === 'draft') {
      const id = payment.paymentId || payment.id || payment._id;
      try {
        await tenantApi.discardAdvanceRentDraft(id);
        onDraftDiscarded(id);
      } catch (error) {
        toast.error(error.message || 'Could not discard the unsubmitted advance draft');
      }
    }
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (channel === 'onsite') {
        await tenantApi.submitOnsitePayment(payment.paymentId || payment.id || payment._id, { note, amount: Number(submittedAmount) });
      } else {
        if (!selected) throw new Error('Choose a landlord payment option.');
        if (!receipt) throw new Error('Upload your transfer receipt.');
        const form = new FormData();
        form.append('channel', channel); form.append('optionId', selected.id); form.append('receipt', receipt);
        form.append('amount', submittedAmount);
        form.append('transferReference', reference); form.append('note', note);
        await tenantApi.submitPaymentEvidence(payment.paymentId || payment.id || payment._id, form);
      }
      setSubmitted(true);
      onPaymentSubmitted();
    } catch (error) { toast.error(error.message || 'Could not submit payment'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
    <button aria-label="Close payment dialog" className="fixed inset-0 bg-slate-950/80" onClick={close} />
    <section role="dialog" aria-modal="true" aria-labelledby="payment-title" className="relative z-10 w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface p-6 shadow-2xl">
      <button onClick={close} aria-label="Close" className="absolute right-4 top-4 p-2 text-slate-500"><X size={18} /></button>
      {submitted ? <div className="py-8 text-center">
        <Clock3 className="mx-auto mb-3 text-amber-500" size={36} />
        <h2 id="payment-title" className="text-xl font-bold text-slate-900 dark:text-white">Submitted for landlord review</h2>
        <p className="mt-2 text-sm text-slate-500">Your invoice remains unpaid until the landlord confirms the transfer or onsite payment.</p>
        <button onClick={close} className="btn btn-brand mt-6 text-sm">Done</button>
      </div> : qrph ? <div className="py-4 text-center space-y-3">
        <h2 id="payment-title" className="text-xl font-bold text-slate-900 dark:text-white">{qrph.status === 'paid' ? 'Payment received' : 'Scan to pay with QR Ph'}</h2>
        {qrph.status === 'paid' ? <p className="text-sm text-slate-500">PayMongo confirmed your payment. Your balance has been updated.</p> : qrph.status === 'failed' ? <p className="text-sm text-rose-600">This payment did not go through. Close and try again.</p> : <>
          <img src={qrph.qrImageUrl} alt="QR Ph payment code" className="mx-auto h-56 w-56 rounded-xl bg-white p-2" />
          <p className="text-sm text-slate-600 dark:text-slate-300">Amount: <b>₱{Number(qrph.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</b>. Scan with any bank or e-wallet app that supports QR Ph.</p>
          <p className="text-xs text-slate-500">Waiting for confirmation… this updates automatically. Your invoice is marked paid only after PayMongo confirms.</p>
        </>}
        <button onClick={close} className="btn btn-secondary border text-sm">{qrph.status === 'paid' ? 'Done' : 'Close'}</button>
      </div> : <form onSubmit={submit}>
        {qrphEnabled && !payment?.isAdvancePayment && <div className="mb-5 rounded-2xl border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm">
          <b className="block text-slate-900 dark:text-white">Pay instantly with QR Ph</b>
          <span className="text-xs text-slate-600 dark:text-slate-300">Confirmed automatically, no receipt upload needed.</span>
          <button type="button" disabled={busy} onClick={startQrph} className="btn btn-primary mt-2 block w-full text-sm">Show QR Ph code for ₱{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</button>
        </div>}
        <h2 id="payment-title" className="text-xl font-bold text-slate-900 dark:text-white">Submit rent payment</h2>
        <p className="mt-1 text-sm text-slate-500">{payment?.period || 'Rent invoice'} · {unit?.label || tenant?.unitLabel || 'Unit'} · Outstanding ₱{outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">Amount to submit (₱)</label>
        <input required type="number" min="0.01" max={outstanding} step="0.01" value={submittedAmount} onChange={(event) => setSubmittedAmount(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          {[['qr_transfer', 'QR transfer'], ['bank_transfer', 'Bank transfer'], ['ewallet_transfer', 'E-wallet (Maya / GCash)'], ['onsite', 'I paid onsite']].map(([value, label]) => <button type="button" key={value} onClick={() => { setChannel(value); const type = { qr_transfer: 'qr', bank_transfer: 'bank_account', ewallet_transfer: 'ewallet' }[value]; if (type) setSelectedId(options.find((o) => o.optionType === type)?.id || ''); }} className={`rounded-xl border p-3 text-sm font-semibold ${channel === value ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>{label}</button>)}
        </div>
        {channel !== 'onsite' && <>
          <label className="mt-4 block text-xs font-semibold text-slate-600 dark:text-slate-300">Landlord payment option</label>
          <select required value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            {options.filter((o) => o.optionType === ({ qr_transfer: 'qr', bank_transfer: 'bank_account', ewallet_transfer: 'ewallet' }[channel])).map((o) => <option key={o.id} value={o.id}>{o.displayName}{o.providerName ? ` · ${o.providerName}` : ''}</option>)}
          </select>
          {['qr', 'ewallet'].includes(selected?.optionType) && selected.qrImageUrl && <img src={selected.qrImageUrl} alt={`${selected.displayName} QR code`} className="mx-auto mt-4 max-h-56 rounded-xl border border-slate-200 object-contain" />}
          {['bank_account', 'ewallet'].includes(selected?.optionType) && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900">{selected.optionType === 'ewallet' ? <Wallet size={16} className="mb-2 text-indigo-500" /> : <Building2 size={16} className="mb-2 text-indigo-500" />}<p><b>{selected.accountHolder}</b></p><p>{selected.providerName} · {selected.optionType === 'ewallet' ? 'Mobile / account' : 'Account'} {selected.accountNumber}</p>{selected.branch && <p>Branch: {selected.branch}</p>}</div>}
          {selected?.instructions && <p className="mt-3 text-sm text-slate-500">{selected.instructions}</p>}
          <p className="mt-4 text-xs font-semibold text-slate-600 dark:text-slate-300">Complete the transfer first, then upload its receipt to submit for review. A receipt is required.</p>
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm dark:border-slate-700"><Upload size={16} />{receipt?.name || 'Choose transfer receipt (PNG, JPG, WebP, PDF)'}<input required type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(event) => setReceipt(event.target.files?.[0] || null)} /></label>
          <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} placeholder="Transfer reference (optional)" className="mt-3 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" />
        </>}
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder={channel === 'onsite' ? 'Where and when did you pay onsite? (optional)' : 'Note for landlord (optional)'} className="mt-3 w-full rounded-xl border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700" rows={2} />
        <button disabled={busy || Number(submittedAmount) <= 0 || Number(submittedAmount) > outstanding || (channel !== 'onsite' && !options.some((o) => o.optionType === ({ qr_transfer: 'qr', bank_transfer: 'bank_account', ewallet_transfer: 'ewallet' }[channel])))} className="btn btn-primary mt-4 w-full text-sm">{busy ? 'Submitting…' : channel === 'onsite' ? 'Notify landlord: I paid onsite' : 'Submit receipt for landlord review'}</button>
      </form>}
    </section>
  </div>;
};
