import React, { useState, useEffect } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, FileText, Download, ShieldCheck, 
  User, Building2, Calendar, HardDrive, ZoomIn, ZoomOut, RotateCw, 
  Check, AlertCircle, Clock, FileCheck, ArrowRight
} from 'lucide-react';
import { landlordApi, tenantApi } from '../../services/api';

export const DocumentInspectionModal = ({ 
  document: doc, 
  onClose, 
  onVerify, 
  onReject 
}) => {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isVerifying, setIsVerifying] = useState(false);
  const [privateFileUrl, setPrivateFileUrl] = useState('');
  const [fileType, setFileType] = useState('');
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);
  // Signed documents open on the signed copy (with signatures stamped in); the original stays one click away.
  const [version, setVersion] = useState(doc?.hasSignedCopy ? 'signed' : 'original');

  useEffect(() => {
    const documentId = doc?.id || doc?._id;
    if (!documentId) return undefined;
    let active = true; let objectUrl;
    setLoadState('loading');
    const load = onVerify || onReject ? landlordApi.getLandlordDocumentFile : tenantApi.getTenantDocumentFile;
    load(documentId, version === 'signed' ? 'signed' : undefined).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) { setPrivateFileUrl(objectUrl); setFileType(blob.type || ''); setLoadState('ready'); }
    }).catch(() => { if (active) setLoadState('error'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc?.id, doc?._id, onVerify, onReject, reloadKey, version]);

  // Keyboard escape handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!doc) return null;

  // The file always comes through the authenticated API as a blob; list rows never carry a public URL.
  const isImage = fileType.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(doc.name || '');
  const serverProxyUrl = privateFileUrl;

  // Close only after the parent confirms the server saved the decision.
  const handleApprove = async () => {
    setIsVerifying(true);
    try {
      const saved = await onVerify(doc.id || doc._id);
      if (saved !== false) onClose();
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDownload = () => {
    if (!privateFileUrl) return;
    const link = document.createElement('a');
    link.href = privateFileUrl;
    link.download = doc.name || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmReject = async (e) => {
    if (e) e.preventDefault();
    if (!rejectionReason.trim()) return;
    const saved = await onReject(doc.id || doc._id, rejectionReason.trim());
    if (saved !== false) onClose();
  };

  const QUICK_REJECTION_REASONS = [
    'Document scan or photo is blurry / illegible',
    'Document date has expired or is invalid',
    'Missing required tenant signature or notary seal',
    'Insurance liability coverage is below $100,000 requirement',
    'Incorrect tenant name or unit number specified',
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md transition-opacity duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-4xl max-h-[92vh] flex flex-col bg-white dark:bg-surface rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all transform scale-100 opacity-100"
        style={{ transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' }}
      >
        {/* ─── MODAL HEADER ─── */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/80 dark:bg-surface-hover/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-grotesk font-extrabold text-lg text-slate-900 dark:text-white leading-tight">
                  {doc.name}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase tracking-wider ${
                  doc.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                  doc.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' :
                  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse'
                }`}>
                  {doc.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Submitted by <span className="font-semibold text-slate-700 dark:text-slate-200">{doc.tenantName}</span> &bull; {doc.unitLabel} ({doc.propertyName})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors btn-press text-xs font-mono flex items-center gap-1.5"
              title="Download File"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 transition-colors btn-press"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── MODAL BODY: Split View (Metadata Sidebar + Interactive PDF Reader) ─── */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* LEFT SIDEBAR: Document Metadata & Details */}
          <div className="lg:col-span-4 p-5 space-y-5 bg-slate-50/50 dark:bg-surface/50 overflow-y-auto">
            
            {/* Resident Info Box */}
            <div className="p-4 rounded-2xl bg-white dark:bg-surface-hover border border-slate-200 dark:border-slate-800/80 space-y-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                Resident & Unit Context
              </span>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-grotesk font-bold">{doc.tenantName}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{doc.unitLabel} &bull; {doc.propertyName}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Uploaded on {doc.date}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{doc.size} &bull; {doc.type}</span>
                </div>
              </div>
            </div>

            {/* Current Status Callout */}
            {doc.status === 'Verified' && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono space-y-1.5 text-emerald-700 dark:text-emerald-400">
                <div className="flex items-center gap-2 font-bold font-grotesk">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Verified & Approved</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  This document was inspected and verified by <strong>{doc.reviewerName || 'Landlord'}</strong> on {doc.verifiedAt ? new Date(doc.verifiedAt).toLocaleDateString() : doc.date}.
                </p>
              </div>
            )}

            {doc.status === 'Rejected' && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs font-mono space-y-1.5 text-rose-700 dark:text-rose-400">
                <div className="flex items-center gap-2 font-bold font-grotesk">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Verification Rejected</span>
                </div>
                <p className="text-xs leading-relaxed">
                  <strong>Reason:</strong> {doc.rejectionReason || 'Document did not meet compliance requirements.'}
                </p>
                {doc.reviewerName && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 block pt-1">
                    Reviewed by {doc.reviewerName}
                  </span>
                )}
              </div>
            )}

            {/* Verification Guidance Checklist (Landlord Only) */}
            {(onVerify || onReject) && (
              <div className="p-4 rounded-2xl bg-white dark:bg-surface-hover border border-slate-200 dark:border-slate-800/80 space-y-2.5 text-xs font-mono">
                <span className="font-grotesk font-bold text-slate-900 dark:text-white block">
                  Verification Guidelines
                </span>
                <ul className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Verify tenant name matches active lease agreement.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Check policy expiration date extends through lease term.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>Ensure document image is clear, unedited, and readable.</span>
                  </li>
                </ul>
              </div>
            )}

            {/* Rejection Form Drawer */}
            {rejecting ? (
              <form onSubmit={handleConfirmReject} className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-grotesk font-bold text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Reject Document
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setRejecting(false)} 
                    className="text-xs text-slate-400 hover:text-slate-600 font-mono"
                  >
                    Cancel
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-mono text-slate-500 dark:text-slate-400 uppercase">
                    Select Quick Reason or Type Below:
                  </label>
                  <div className="space-y-1">
                    {QUICK_REJECTION_REASONS.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setRejectionReason(r)}
                        className={`w-full text-left p-1.5 rounded-lg text-xs font-mono border transition-colors ${
                          rejectionReason === r 
                            ? 'bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300 font-semibold' 
                            : 'bg-white dark:bg-surface-hover border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        &bull; {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <textarea
                    rows={2}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter specific feedback for the tenant..."
                    className="w-full bg-white dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl p-2 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={!rejectionReason.trim()}
                  className="btn btn-danger w-full font-grotesk text-xs"
                >
                  Confirm & Reject Document
                </button>
              </form>
            ) : null}

          </div>

          {/* RIGHT SIDE: Interactive Document Canvas Viewer */}
          <div className="lg:col-span-8 p-6 bg-slate-900/10 dark:bg-black/40 flex flex-col justify-between items-center relative overflow-hidden min-h-[440px]">
            
            {/* Viewer Floating Controls */}
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-white text-xs font-mono shadow-lg">
              <button 
                onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors btn-press"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-xs font-bold">{zoomLevel}%</span>
              <button 
                onClick={() => setZoomLevel(prev => Math.min(150, prev + 15))}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors btn-press"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Document Canvas: Real File Viewer */}
            <div className="w-full flex-1 flex flex-col items-center gap-3 p-4 overflow-auto scrollbar-thin">
              {doc.hasSignedCopy && (
                <div role="tablist" aria-label="Document version" className="inline-flex self-start rounded-lg border border-line bg-surface p-0.5 text-xs shadow-sm">
                  {[['signed', 'Signed copy'], ['original', 'Original']].map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={version === key} onClick={() => setVersion(key)} className={`rounded-md px-3 py-1.5 font-medium ${version === key ? 'bg-brand text-brand-ink' : 'text-ink-muted hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
              )}
              {loadState === 'loading' && (
                <p role="status" className="py-24 text-sm text-ink-muted">Loading file…</p>
              )}
              {loadState === 'error' && (
                <div role="alert" className="py-20 text-center space-y-3">
                  <AlertTriangle className="mx-auto h-6 w-6 text-danger-ink" />
                  <p className="text-sm font-medium text-ink">This file couldn’t be loaded.</p>
                  <p className="text-xs text-ink-muted">It may still be processing, or storage is unreachable.</p>
                  <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="btn btn-secondary btn-sm">Try again</button>
                </div>
              )}
              {loadState === 'ready' && serverProxyUrl && (
                isImage ? (
                  <div className="flex w-full items-center justify-center overflow-auto" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}>
                    <img src={serverProxyUrl} alt={doc.name} className="max-w-full rounded-lg border border-line bg-white shadow-sm" style={{ maxHeight: '70vh', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div className="w-full" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}>
                    <iframe src={serverProxyUrl} title={doc.name} className="w-full rounded-lg border border-line bg-white shadow-sm" style={{ height: '65vh', minHeight: '400px' }} />
                  </div>
                )
              )}
            </div>


            {/* Bottom Floating Action Bar for Verification Decision */}
            {!rejecting && (
              <div className="w-full pt-4 mt-2 border-t border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/90 dark:bg-surface/90 backdrop-blur-md p-4 rounded-2xl border shrink-0">
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <span>Verification Status:</span>
                  <strong className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    doc.status === 'Verified' || doc.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                    doc.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' :
                    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}>
                    {doc.status}
                  </strong>
                </div>

                {(onVerify || onReject) ? (
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    {onReject && (
                      <button
                        type="button"
                        onClick={() => setRejecting(true)}
                        className="btn btn-danger-soft flex-1 sm:flex-initial border font-grotesk text-xs flex items-center justify-center gap-2"
                      >
                        <AlertCircle className="w-4 h-4" />
                        <span>Reject Document</span>
                      </button>
                    )}

                    {onVerify && (
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={isVerifying || doc.status === 'Verified'}
                        className="btn btn-primary flex-1 sm:flex-initial font-grotesk text-xs flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{doc.status === 'Verified' ? 'Already Verified' : 'Approve & Mark Verified'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="btn btn-brand font-grotesk text-xs flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" /> Download Copy
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs hover:bg-slate-200"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
};
