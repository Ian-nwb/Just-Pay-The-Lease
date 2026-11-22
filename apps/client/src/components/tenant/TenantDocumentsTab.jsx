import React, { useState, useEffect } from 'react';
import { 
  FileText, CheckCircle2, Clock, Download, Plus, Search, Filter, 
  Upload, FileCheck, AlertTriangle, ShieldAlert, Eye, AlertCircle, RefreshCw
} from 'lucide-react';
import { DocumentInspectionModal } from '../dashboard/DocumentInspectionModal';
import { SubmitDocumentModal } from './SubmitDocumentModal';
import { SignaturePad } from '../common/SignaturePad';
import { tenantApi, notificationApi } from '../../services/api';

export const TenantDocumentsTab = ({
  tenant,
  unit,
}) => {
  // Server records only. The server already limits this list to the signed-in tenant.
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function loadDocs() {
      try {
        const res = await tenantApi.getDocuments();
        if (!isMounted) return;
        const rawList = res.documents || res.data || [];
        setDocuments((Array.isArray(rawList) ? rawList : []).map((d) => ({ ...d, id: d._id || d.id })));
        setDocsError('');
      } catch (err) {
        if (isMounted) setDocsError(err.message || 'Could not load your documents.');
      } finally {
        if (isMounted) setDocsLoading(false);
      }
    }
    loadDocs();
    return () => { isMounted = false; };
  }, []);

  const updateDocumentList = (newDocs) => setDocuments(newDocs);

  // Building policies the landlord published for this tenant's current property.
  const [policies, setPolicies] = useState([]);
  const [policyError, setPolicyError] = useState('');
  useEffect(() => {
    let active = true;
    tenantApi.getPolicies()
      .then((res) => { if (active) setPolicies(res.data || []); })
      .catch((error) => { if (active) setPolicyError(error.message || 'Could not load building policies.'); });
    return () => { active = false; };
  }, []);
  const openPolicy = async (policy) => {
    try {
      const blob = await tenantApi.getPolicyFile(policy.id);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (error) {
      setPolicyError(error.message || 'Could not open this policy.');
    }
  };

  const [liveExpirationReminder, setLiveExpirationReminder] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    notificationApi.streamComplianceReminders({
      signal: controller.signal,
      onReminder: (notification) => setLiveExpirationReminder(notification),
    }).catch((error) => {
      if (!controller.signal.aborted) console.warn('Compliance reminder stream disconnected:', error.message);
    });
    return () => controller.abort();
  }, []);

  const tenantDocs = documents;

  const [docStatusFilter, setDocStatusFilter] = useState('all'); // 'all' | 'Pending Review' | 'Verified' | 'Rejected'
  const [docCategoryFilter, setDocCategoryFilter] = useState('all');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocForInspection, setSelectedDocForInspection] = useState(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [signingDoc, setSigningDoc] = useState(null);
  const [signedName, setSignedName] = useState(tenant?.name || '');
  const [signatureImage, setSignatureImage] = useState('');
  const [signingBusy, setSigningBusy] = useState(false);

  const signDocument = async (event) => {
    event.preventDefault(); if (!signingDoc) return; setSigningBusy(true);
    try {
      const result = await tenantApi.signLeaseDocument(signingDoc.id || signingDoc._id, signedName, signatureImage);
      updateDocumentList(documents.map((doc) => String(doc.id || doc._id) === String(signingDoc.id || signingDoc._id) ? { ...doc, hasSignedCopy: Boolean(result.data.hasSignedCopy), signingRecord: { signedName: result.data.signedName, signedAt: result.data.signedAt } } : doc));
      setSigningDoc(null);
    } catch (error) { window.alert(error.message || 'Could not sign this document'); }
    finally { setSigningBusy(false); }
  };

  // Upload goes to the server first; the list only changes after it succeeds.
  // Errors are re-thrown so the submit modal stays open and shows them.
  const handleDocModalSubmit = async (docData) => {
    let res;
    if (docData.file) {
      const formData = new FormData();
      formData.append('file', docData.file);
      formData.append('name', docData.name);
      formData.append('type', docData.type);
      formData.append('category', docData.category || 'upload');
      if (docData.expirationDate) formData.append('expirationDate', docData.expirationDate);
      formData.append('notes', docData.notes || '');
      res = await tenantApi.uploadDocument(formData);
    } else {
      res = await tenantApi.uploadDocument({
        name: docData.name,
        type: docData.type,
        category: docData.category || 'upload',
        expirationDate: docData.expirationDate,
        notes: docData.notes || '',
      });
    }
    const createdDoc = res?.data || res?.document;
    if (!createdDoc) throw new Error('The server did not confirm the upload.');
    updateDocumentList([{ ...createdDoc, id: createdDoc._id || createdDoc.id }, ...documents]);
    setIsSubmitModalOpen(false);
  };

  return (
    <div className="space-y-6">

      {liveExpirationReminder && (
        <div role="status" className="p-4 rounded-2xl border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start justify-between gap-3">
          <div>
            <strong className="block font-grotesk text-sm">{liveExpirationReminder.title}</strong>
            <span className="text-xs">{liveExpirationReminder.body}</span>
          </div>
          <button type="button" onClick={() => setLiveExpirationReminder(null)} className="text-xs underline">Dismiss</button>
        </div>
      )}
      
      {(policies.length > 0 || policyError) && (
        <div className="p-5 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-3">
          <h2 className="text-sm font-bold font-grotesk text-slate-900 dark:text-white">Building policies</h2>
          {policyError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{policyError}</p>}
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {policies.map((policy) => (
              <li key={policy.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0">
                  <strong className="block text-slate-900 dark:text-white truncate">{policy.title}</strong>
                  <span className="text-slate-500">{policy.type} · posted {new Date(policy.publishedAt).toLocaleDateString()}</span>
                </span>
                <button type="button" onClick={() => openPolicy(policy)} className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 shrink-0"><Eye className="w-3.5 h-3.5" /> View</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Header & Title */}
      <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-medium">
            <FileCheck className="w-3.5 h-3.5" />
            <span>Resident Compliance Vault</span>
          </div>
          <h1 className="text-2xl font-extrabold font-grotesk text-slate-900 dark:text-white mt-1">
            Documents & Verification Workspace
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
            Submit required lease compliance files (Government ID, Renter Insurance, Income Proof) and view your landlord's verification decisions.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsSubmitModalOpen(true)}
          className="btn btn-primary font-grotesk text-xs flex items-center gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" /> Submit Document for Review
        </button>
      </div>

      {/* Metric Stats Bar (Matching Landlord layout) */}
      {(() => {
        const pendingCount = tenantDocs.filter(d => d.status === 'Pending Review').length;
        const verifiedCount = tenantDocs.filter(d => d.status === 'Verified' || d.status === 'Active').length;
        const rejectedCount = tenantDocs.filter(d => d.status === 'Rejected').length;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-1">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">My Total Documents</span>
              <strong className="text-xl text-slate-900 dark:text-white font-grotesk block">{tenantDocs.length}</strong>
              <span className="text-xs text-slate-500 font-mono">Personal & Building Files</span>
            </div>

            <div className="p-4 rounded-2xl apple-glass top-shade border border-amber-500/30 bg-amber-500/5 space-y-1">
              <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">
                Pending Review
              </span>
              <strong className="text-2xl text-amber-600 dark:text-amber-400 font-grotesk block">{pendingCount}</strong>
              <span className="text-xs text-amber-700/80 dark:text-amber-400/80 font-mono">Submitted for Landlord Verification</span>
            </div>

            <div className="p-4 rounded-2xl apple-glass top-shade border border-emerald-500/20 bg-emerald-500/5 space-y-1">
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider block">
                Verified Compliant
              </span>
              <strong className="text-2xl text-emerald-600 dark:text-emerald-400 font-grotesk block">{verifiedCount}</strong>
              <span className="text-xs text-emerald-700/80 dark:text-emerald-400/80 font-mono">Approved Active Files</span>
            </div>

            <div className="p-4 rounded-2xl apple-glass top-shade border border-rose-500/20 bg-rose-500/5 space-y-1">
              <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider block">
                Rejected / Needs Action
              </span>
              <strong className="text-2xl text-rose-600 dark:text-rose-400 font-grotesk block">{rejectedCount}</strong>
              <span className="text-xs text-rose-700/80 dark:text-rose-400/80 font-mono">Action Required from You</span>
            </div>
          </div>
        );
      })()}

      {/* Filters & Search Toolbar (Matching Landlord layout) */}
      <div className="p-4 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/60 dark:bg-surface border border-slate-300/60 dark:border-slate-800 overflow-x-auto w-full md:w-auto">
          {[
            { key: 'all', label: `All (${tenantDocs.length})` },
            { key: 'Pending Review', label: `Pending (${tenantDocs.filter(d => d.status === 'Pending Review').length})` },
            { key: 'Verified', label: `Verified (${tenantDocs.filter(d => d.status === 'Verified' || d.status === 'Active').length})` },
            { key: 'Rejected', label: `Rejected (${tenantDocs.filter(d => d.status === 'Rejected').length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setDocStatusFilter(t.key)}
              className={`px-3 py-1.5 rounded-xl font-grotesk font-semibold transition-all whitespace-nowrap btn-press ${
                docStatusFilter === t.key
                  ? 'bg-brand text-brand-ink shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Category & Search Input */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={docSearchQuery}
              onChange={(e) => setDocSearchQuery(e.target.value)}
              placeholder="Search file title..."
              className="w-full bg-white dark:bg-surface border border-slate-300 dark:border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>

          <select
            value={docCategoryFilter}
            onChange={(e) => setDocCategoryFilter(e.target.value)}
            className="bg-white dark:bg-surface border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-slate-900 dark:text-white text-xs font-mono"
          >
            <option value="all">All Document Types</option>
            <option value="Proof of Insurance">Renter Insurance</option>
            <option value="Government ID">Government ID</option>
            <option value="Income Verification">Income Proof</option>
            <option value="Pet Registration">Pet Registration</option>
            <option value="Lease Agreement">Lease Contract</option>
            <option value="House Rules">Building House Rules</option>
          </select>
        </div>
      </div>

      {/* Master Tenant Documents Table */}
      {(() => {
        const filteredDocs = tenantDocs.filter(d => {
          const matchesStatus = docStatusFilter === 'all' || 
            d.status === docStatusFilter || 
            (docStatusFilter === 'Verified' && d.status === 'Active');
          const matchesCategory = docCategoryFilter === 'all' || d.type === docCategoryFilter;
          const q = docSearchQuery.toLowerCase();
          const matchesSearch = (d.name || '').toLowerCase().includes(q) || (d.type || '').toLowerCase().includes(q);
          return matchesStatus && matchesCategory && matchesSearch;
        });

        return (
          <div className="border border-slate-200 dark:border-slate-800/80 rounded-3xl overflow-hidden apple-glass top-shade shadow-xl">
            {docsLoading ? (
              <div className="p-12 text-center text-sm text-slate-500" role="status">Loading your documents…</div>
            ) : docsError ? (
              <div className="p-12 text-center space-y-2" role="alert">
                <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="font-grotesk font-bold text-slate-700 dark:text-slate-300">Could not load your documents</p>
                <p className="text-xs text-slate-500">{docsError}</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <FileText className="w-10 h-10 text-slate-400 mx-auto stroke-1" />
                <p className="font-grotesk font-bold text-slate-700 dark:text-slate-300 text-base">
                  No documents found matching filters
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  Try adjusting your search or category selection above, or submit a new document.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDocs.map((docItem) => (
                  <div 
                    key={docItem.id}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors font-mono text-xs hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${
                      docItem.status === 'Rejected' ? 'bg-rose-500/[0.03]' : ''
                    }`}
                  >
                    {/* Doc Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        docItem.status === 'Verified' || docItem.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        docItem.status === 'Rejected' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        <FileText className="w-5 h-5" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="font-grotesk font-bold text-sm text-slate-900 dark:text-white truncate">
                            {docItem.name}
                          </strong>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-mono border border-slate-200 dark:border-slate-700">
                            {docItem.type}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Scope: <strong className="text-slate-800 dark:text-slate-200">
                            {docItem.tenantId === 'all'
                              ? 'Building-wide Policy'
                              : `${docItem.tenantName || tenant?.name || 'You'} (${docItem.unitLabel || 'Unit'})`}
                          </strong>
                        </p>

                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>
                            Submitted: {docItem.date || (docItem.createdAt ? new Date(docItem.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'Recently')}
                          </span>
                          <span>&bull;</span>
                          <span>Size: {docItem.size || '0.3 MB'}</span>
                          {docItem.reviewerName && (
                            <>
                              <span>&bull;</span>
                              <span>Reviewer: {docItem.reviewerName}</span>
                            </>
                          )}
                        </div>

                        {/* Rejection feedback banner if flagged by landlord */}
                        {docItem.status === 'Rejected' && (
                          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                            <div className="text-xs space-y-0.5">
                              <strong className="font-grotesk font-bold block text-rose-800 dark:text-rose-200 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> Verification Declined by Landlord
                              </strong>
                              <p>Reason: <em>{docItem.rejectionReason || 'Document did not meet requirement specs.'}</em></p>
                            </div>

                            <button
                              type="button"
                              onClick={() => setIsSubmitModalOpen(true)}
                              className="btn btn-danger font-grotesk text-xs shrink-0 flex items-center gap-1.5"
                            >
                              <RefreshCw className="w-3.5 h-3.5" /> Upload Corrected File
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2.5 shrink-0 justify-end">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 ${
                        docItem.status === 'Verified' || docItem.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                        docItem.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                        {(docItem.status === 'Verified' || docItem.status === 'Active') && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        {docItem.status === 'Rejected' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                        {docItem.status === 'Pending Review' && <Clock className="w-3.5 h-3.5 text-amber-500" />}
                        <span>{docItem.status}</span>
                      </span>

                      <button
                        type="button"
                        onClick={() => setSelectedDocForInspection(docItem)}
                        className="btn btn-brand font-grotesk text-xs flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Inspect
                      </button>

                      {docItem.signaturePlacement?.placedAt && !docItem.signingRecord?.signedAt && <button type="button" onClick={() => { setSigningDoc(docItem); setSignedName(tenant?.name || ''); }} className="btn btn-primary text-xs">Sign PDF</button>}
                      {docItem.signingRecord?.signedAt && <span className="badge badge-success">You signed {new Date(docItem.signingRecord.signedAt).toLocaleDateString()}</span>}
                      {docItem.landlordSigningRecord?.signedAt && <span className="badge badge-success">Landlord signed</span>}
                      {docItem.hasSignedCopy && <button type="button" onClick={async () => { try { const blob = await tenantApi.getTenantDocumentFile(docItem.id || docItem._id, 'signed'); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); } catch (error) { setPolicyError(error.message || 'Could not open the signed copy.'); } }} className="flex items-center gap-1.5 rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"><FileCheck size={14}/>Signed copy</button>}

                      <button
                        type="button"
                        onClick={() => alert(`Downloading official PDF for ${docItem.name}...`)}
                        className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 btn-press"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Expiration Policy Lead Time Card */}
      <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
        <h3 className="text-sm font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-indigo-500" /> Automated Compliance Expiration Reminders
        </h3>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div>
            <strong className="text-slate-900 dark:text-white block font-grotesk text-sm">Expiration Reminder Notice Lead Time</strong>
            <span className="text-slate-500 text-xs">Automatically notify residents before their renter insurance policies or occupancy permits expire.</span>
          </div>
          <span className="text-indigo-600 dark:text-indigo-300 font-semibold text-xs shrink-0">Your landlord sets the reminder lead time</span>
        </div>
      </div>

      {/* Render Submit Document Modal */}
      <SubmitDocumentModal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        onSubmit={handleDocModalSubmit}
        tenant={tenant}
        unit={unit}
      />

      {/* Render Inspection Modal (Reusing landlord inspection canvas view, read-only for tenant) */}
      {selectedDocForInspection && (
        <DocumentInspectionModal
          document={selectedDocForInspection}
          onClose={() => setSelectedDocForInspection(null)}
          onVerify={null} // Read-only for tenant
          onReject={null} // Read-only for tenant
        />
      )}
      {signingDoc && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><form onSubmit={signDocument} className="card-pop w-full max-w-lg p-5"><h2 className="text-lg font-bold">Sign {signingDoc.name}</h2><p className="mt-2 text-sm text-ink-muted">Draw your signature or upload an image of it. It is placed in the box your landlord marked, with your name and the time.</p><div className="mt-4"><SignaturePad onChange={setSignatureImage} /></div><label className="mt-4 block text-xs font-semibold">Full name<input required maxLength={120} value={signedName} onChange={(event) => setSignedName(event.target.value)} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-300">This records your acknowledgement in JPTL; it does not claim legal compliance or replace legal advice.</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setSigningDoc(null)} className="btn btn-secondary border text-sm">Cancel</button><button disabled={signingBusy || !signatureImage || !signedName.trim()} className="btn btn-primary text-sm">{signingBusy ? 'Saving…' : 'Sign document'}</button></div></form></div>}

    </div>
  );
};
