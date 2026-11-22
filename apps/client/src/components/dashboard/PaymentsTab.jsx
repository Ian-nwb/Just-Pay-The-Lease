import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Download, Eye, XCircle } from 'lucide-react';
import { landlordApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export const PaymentsTab = ({ payments: initialPayments = [], searchQuery = '' }) => {
  const [payments, setPayments] = useState(initialPayments);
  const [statusFilter, setStatusFilter] = useState('all');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [iouPanel, setIouPanel] = useState(null);
  const [rejectingIou, setRejectingIou] = useState(null);
  const [iouReason, setIouReason] = useState('');
  const toast = useToast();
  useEffect(() => setPayments(initialPayments || []), [initialPayments]);

  const refresh = async () => {
    const response = await landlordApi.getRentRoll();
    setPayments(Array.isArray(response?.data) ? response.data : (response?.payments || []));
  };
  const review = async (payment, action, rejectionReason = '') => {
    const id = payment.id || payment._id;
    setBusyId(id);
    try {
      await landlordApi.reviewPayment(id, action === 'approve' ? { action } : { action, reason: rejectionReason });
      toast.success(action === 'approve' ? 'Payment approved and invoice marked paid.' : 'Receipt declined. Tenant can resubmit.');
      setRejecting(null); setReason(''); await refresh();
    } catch (error) { toast.error(error.message || 'Could not review payment'); }
    finally { setBusyId(''); }
  };
  // Reversal keeps the allocation on record; the balance and status are recalculated server-side.
  const reverseAllocation = async (payment, allocation) => {
    const why = window.prompt(`Reverse the ₱${Number(allocation.amount).toLocaleString()} payment? Give a reason (shown to the tenant):`);
    if (!why || !why.trim()) return;
    setBusyId(String(allocation.id));
    try { await landlordApi.reversePaymentAllocation(payment.id || payment._id, allocation.id, why.trim()); toast.success('Payment reversed. The outstanding balance was updated.'); await refresh(); }
    catch (error) { toast.error(error.message || 'Could not reverse payment'); }
    finally { setBusyId(''); }
  };
  const openEvidence = async (payment) => {
    try { const blob = await landlordApi.getPaymentEvidence(payment.id || payment._id); const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (error) { toast.error(error.message); }
  };
  const openIous = async (payment) => {
    try { const response = await landlordApi.getPaymentIous(payment.id || payment._id); setIouPanel({ payment, requests: response?.data || [] }); }
    catch (error) { toast.error(error.message || 'Could not load IOU requests'); }
  };
  const decideIou = async (iou, action, note = '') => {
    setBusyId(String(iou._id));
    try { await landlordApi.reviewIou(iou._id, { action, note }); toast.success(action === 'approve' ? 'IOU approved. The balance remains outstanding.' : 'IOU declined.'); setRejectingIou(null); await openIous(iouPanel.payment); await refresh(); }
    catch (error) { toast.error(error.message || 'Could not review IOU'); }
    finally { setBusyId(''); }
  };
  const exportCsv = () => {
    const headers = ['Tenant', 'Property', 'Unit', 'Amount', 'Invoice status', 'Review status', 'Due date'];
    const rows = payments.map((p) => [p.tenantName || 'Tenant', p.propertyName || '', p.unitLabel || '', p.amount || 0, p.status || '', p.reviewStatus || '', p.dueDate || ''].map((v) => `"${String(v).replaceAll('"', '""')}"`));
    const url = URL.createObjectURL(new Blob([[headers.join(','), ...rows.map((r) => r.join(','))].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'jptl-rent-roll.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const filtered = payments.filter((p) => {
    const q = searchQuery.toLowerCase();
    if (![p.tenantName, p.propertyName, p.unitLabel].some((value) => String(value || '').toLowerCase().includes(q))) return false;
    return statusFilter === 'all' || (statusFilter === 'pending_review' ? p.reviewStatus === 'pending_review' : p.status === statusFilter);
  });
  const collected = payments.reduce((sum, payment) => sum + Number(payment.paidAmount || (payment.status === 'paid' ? payment.amount : 0)), 0);
  const outstanding = payments.filter((p) => ['pending', 'partially_paid', 'overdue'].includes(p.status)).reduce((s, p) => s + Number(p.outstandingBalance ?? p.amount ?? 0), 0);
  const statusClass = (payment) => {
    if (payment.reviewStatus === 'pending_review') return 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200';
    if (payment.reviewStatus === 'rejected') return 'border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
    if (payment.status === 'paid') return 'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';
    if (payment.status === 'overdue') return 'border-rose-200 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
    return 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  };

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-surface dark:text-white"><p className="text-xs uppercase text-slate-500">Collected</p><strong className="text-2xl">₱{collected.toLocaleString()}</strong></div><div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-surface dark:text-white"><p className="text-xs uppercase text-slate-500">Outstanding, including review queue</p><strong className="text-2xl">₱{outstanding.toLocaleString()}</strong></div><div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 dark:border-slate-800 dark:bg-surface dark:text-white"><div><p className="text-xs uppercase text-slate-500">Payment workflow</p><strong className="text-sm">Manual confirmation</strong></div><button onClick={exportCsv} className="rounded-lg border border-slate-300 p-2 text-slate-700 dark:border-slate-700 dark:text-slate-200" title="Export CSV"><Download size={17} /></button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface"><div><h2 className="font-bold text-slate-900 dark:text-white">Rent roll and payment review</h2><p className="text-xs text-slate-500">Submitted amounts stay uncollected until approved. IOUs record an agreement but do not clear the balance.</p></div><div className="flex flex-wrap gap-1">{[['all', 'All'], ['pending_review', 'Needs review'], ['pending', 'Pending'], ['partially_paid', 'Partially paid'], ['overdue', 'Overdue'], ['paid', 'Paid']].map(([key, label]) => <button key={key} onClick={() => setStatusFilter(key)} className={`rounded-lg px-3 py-1.5 text-xs ${statusFilter === key ? 'bg-brand text-brand-ink' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{label}</button>)}</div></div>
    <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 dark:divide-slate-800 dark:border-slate-800 dark:bg-surface dark:text-white">{filtered.length ? filtered.map((p) => {
      const id = p.id || p._id; const review = p.reviewStatus === 'pending_review';
      return <article key={id} className="flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><b>{p.tenantName || 'Tenant'}</b><span className="text-xs text-slate-500">{p.unitLabel} · {p.propertyName}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass(p)}`}>{review ? 'Awaiting review' : p.reviewStatus === 'rejected' ? 'Rejected' : p.status === 'pending' ? 'Unpaid' : p.status.replace('_', ' ')}</span></div><p className="mt-1 text-xs text-slate-500">{p.period} · Due {p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '—'} · {p.paymentChannel?.replace('_', ' ') || p.paymentMethod || 'No payment submitted'}</p>{Number(p.paidAmount || 0) > 0 && <p className="mt-1 text-sm font-medium">Paid ₱{Number(p.paidAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} · Outstanding ₱{Number(p.outstandingBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}{review && p.submittedAmount && <p className="mt-1 text-xs text-amber-700">Submitted amount: ₱{Number(p.submittedAmount).toLocaleString()}</p>}{p.transferReference && <p className="mt-1 text-xs">Reference: {p.transferReference}</p>}{p.tenantPaymentNote && <p className="mt-1 text-xs text-slate-500">Tenant note: {p.tenantPaymentNote}</p>}{p.rejectionReason && <p className="mt-1 text-xs text-rose-600">Previous rejection: {p.rejectionReason}</p>}{(p.paymentAllocations || []).length > 0 && <ul className="mt-2 space-y-1 text-xs">{p.paymentAllocations.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-2"><span className={a.reversedAt ? 'line-through text-slate-400' : ''}>₱{Number(a.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} · {String(a.channel || '').replace('_', ' ')} · {a.confirmedAt ? new Date(a.confirmedAt).toLocaleDateString() : ''}</span>{a.reversedAt ? <span className="text-rose-600">Reversed: {a.reversalReason}</span> : a.id && <button type="button" disabled={busyId === String(a.id)} onClick={() => reverseAllocation(p, a)} className="rounded border px-2 py-0.5 text-[11px] disabled:opacity-50">Reverse</button>}</li>)}</ul>}{(p.corrections || []).length > 0 && <p className="mt-1 text-xs text-slate-500">{p.corrections.length} correction{p.corrections.length > 1 ? 's' : ''} · latest: {p.corrections[p.corrections.length - 1].reason}</p>}</div><div className="flex flex-wrap items-center gap-3"><strong>Invoice ₱{Number(p.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong><button onClick={() => openIous(p)} className="rounded-lg border px-3 py-2 text-xs">IOU requests</button>{p.hasReceipt && <button onClick={() => openEvidence(p)} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs"><Eye size={14} /> View receipt</button>}{review && <><button disabled={busyId === id} onClick={() => review(p, 'approve')} className="btn btn-primary text-xs"><CheckCircle2 className="mr-1 inline" size={14} />Approve</button><button disabled={busyId === id} onClick={() => { setRejecting(p); setReason(''); }} className="btn btn-danger text-xs"><XCircle className="mr-1 inline" size={14} />Decline</button></>}</div></article>;
    }) : <p className="p-10 text-center text-sm text-slate-500">No payments match this view.</p>}</div>
    {iouPanel && <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-surface"><div className="flex items-center justify-between"><h3 className="font-bold">IOU requests · {iouPanel.payment.tenantName || iouPanel.payment.period}</h3><button onClick={() => setIouPanel(null)} className="btn btn-secondary border text-xs">Close</button></div>{!iouPanel.requests.length ? <p className="mt-3 text-sm text-slate-500">No IOU requests for this invoice.</p> : <div className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">{iouPanel.requests.map((iou) => <article key={iou._id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row"><div><p className="font-semibold">₱{Number(iou.amount).toLocaleString()} · {iou.status}</p><p className="text-sm text-slate-600 dark:text-slate-300">{iou.reason}</p><p className="text-xs text-slate-500">Proposed due {new Date(iou.proposedDueDate).toLocaleDateString()}{iou.decisionNote ? ` · ${iou.decisionNote}` : ''}</p></div>{iou.status === 'pending' && <div className="flex gap-2"><button disabled={busyId === String(iou._id)} onClick={() => decideIou(iou, 'approve')} className="btn btn-primary text-xs">Approve IOU</button><button onClick={() => { setRejectingIou(iou); setIouReason(''); }} className="rounded-lg border px-3 py-2 text-xs">Decline</button></div>}</article>)}</div>}</div>}
    {rejecting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); review(rejecting, 'reject', reason); }} className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">Decline payment evidence</h3><p className="mt-1 text-sm text-slate-500">Tell the tenant what needs to be corrected.</p><textarea autoFocus required minLength={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-4 w-full rounded-xl border bg-transparent p-3 text-sm" rows={4} placeholder="Reason for decline" /><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setRejecting(null)} className="btn btn-secondary border text-sm">Cancel</button><button disabled={busyId === (rejecting.id || rejecting._id)} className="btn btn-danger text-sm">Decline</button></div></form></div>}
    {rejectingIou && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><form onSubmit={(event) => { event.preventDefault(); decideIou(rejectingIou, 'reject', iouReason); }} className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900"><h3 className="font-bold">Decline IOU request</h3><label className="mt-3 block text-xs font-semibold">Reason<textarea autoFocus required minLength={3} maxLength={1000} value={iouReason} onChange={(event) => setIouReason(event.target.value)} className="mt-2 w-full rounded-xl border bg-transparent p-3 text-sm" rows={3}/></label><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setRejectingIou(null)} className="btn btn-secondary border text-sm">Cancel</button><button disabled={busyId === String(rejectingIou._id)} className="btn btn-danger text-sm">Decline request</button></div></form></div>}
  </div>;
};
