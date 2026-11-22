import React, { useState } from 'react';
import { X, FileText, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react';
import { tenantApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatPhp } from '../../utils/currency';

export const LeaseRenewalModal = ({
  isOpen,
  onClose,
  unit,
  property,
  lease,
  onRenewalSubmitted = () => {},
}) => {
  const toast = useToast();
  const [term, setTerm] = useState(12); // 6 | 12 | 24
  const [proposedStartOverride, setProposedStartOverride] = useState(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  // Keep the default as a date-only value so the browser timezone cannot shift it.
  const rawEnd = lease?.leaseEnd || unit?.leaseEnd;
  let defaultProposedStartDate = '';
  if (rawEnd) {
    const endDate = typeof rawEnd === 'string' ? rawEnd.slice(0, 10) : new Date(rawEnd).toISOString().slice(0, 10);
    const nextDay = new Date(`${endDate}T00:00:00.000Z`);
    if (!Number.isNaN(nextDay.getTime())) {
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      defaultProposedStartDate = nextDay.toISOString().slice(0, 10);
    }
  } else {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: property?.timezone || 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    defaultProposedStartDate = `${values.year}-${values.month}-${values.day}`;
  }
  const proposedStartDate = proposedStartOverride ?? defaultProposedStartDate;

  if (!isOpen) return null;

  const currentEnd = lease?.leaseEnd || unit?.leaseEnd;
  const currentRent = lease?.monthlyRent || unit?.monthlyRent || 2400;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const res = await tenantApi.requestLeaseExtension({
        termMonths: term,
        proposedStartDate,
        notes: notes.trim(),
      });

      setIsSuccess(true);
      toast.success(`Lease extension request for ${term} months submitted!`);
      setTimeout(() => {
        onRenewalSubmitted(res.data?.extensionRequest || { term, proposedStartDate, notes });
        setIsSuccess(false);
        onClose();
      }, 1400);
    } catch (err) {
      console.error('Failed to submit lease extension request:', err);
      setError(err.response?.data?.message || err.message || 'Failed to submit extension request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white dark:bg-surface border border-slate-200 dark:border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl z-10 my-8 top-shade modal-enter modal-enter-active apple-glass">
        {/* Close Button */}
        {!isSubmitting && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center justify-center border border-slate-200 dark:border-slate-800 btn-press"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-grotesk text-slate-900 dark:text-white">Request Lease Extension</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {unit?.label || 'Unit'} &bull; {property?.name || 'Property'}
            </p>
          </div>
        </div>

        {isSuccess ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold font-grotesk text-slate-900 dark:text-white">Request Submitted!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Your landlord will review your {term}-month renewal request and notify you shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Current Lease Info */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 font-mono space-y-1">
              <div className="flex justify-between text-slate-500">
                <span>Current Expiration:</span>
                <strong className="text-slate-900 dark:text-white">
                  {currentEnd ? new Date(currentEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </strong>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Current Monthly Rate:</span>
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {formatPhp(currentRent)}/mo
                </strong>
              </div>
            </div>

            {/* Renewal Term Selector */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Select Extension Duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { months: 6, label: '6 Months' },
                  { months: 12, label: '12 Months (Standard)' },
                  { months: 24, label: '24 Months' },
                ].map((t) => (
                  <button
                    type="button"
                    key={t.months}
                    onClick={() => setTerm(t.months)}
                    className={`p-3 rounded-xl border text-xs font-semibold btn-press text-center transition-all ${
                      term === t.months
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Proposed Effective Date */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Proposed Effective Start Date
              </label>
              <input
                type="date"
                value={proposedStartDate}
                min={defaultProposedStartDate}
                onChange={(e) => setProposedStartOverride(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
              />
            </div>

            {/* Special Request Notes */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Tenant Comments / Renewal Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Planning to continue residency long term..."
                className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="btn btn-secondary border"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-primary font-grotesk flex items-center gap-1.5"
              >
                <span>{isSubmitting ? 'Submitting...' : 'Submit Extension Request'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
