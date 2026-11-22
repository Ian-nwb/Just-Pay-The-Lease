import React, { useState, useEffect } from 'react';
import { 
  FileText, CheckCircle2, Clock, Download, Search, Filter, Plus, Archive,
  Upload, FileCheck, AlertTriangle, ShieldAlert, Eye, AlertCircle, PenTool
} from 'lucide-react';
import { DocumentInspectionModal } from './DocumentInspectionModal';
import { PublishPolicyModal } from './PublishPolicyModal';
import { landlordApi } from '../../services/api';
import { SignaturePlacementModal } from './SignaturePlacementModal';

export const LandlordDocumentsTab = ({
  documents: documentsProp,
  onUpdateDocumentStatus,
  properties = [],
  units = [],
  tenants = [],
  landlordName = '',
}) => {
  const [docExpirationReminderDays, setDocExpirationReminderDays] = useState('30');
  // Server records only: no mock or browser-session fallback.
  const [documents, setDocuments] = useState(() => documentsProp || []);
  const [reviewError, setReviewError] = useState('');
  const [reviewingId, setReviewingId] = useState(null);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [policies, setPolicies] = useState([]);
  const [policyError, setPolicyError] = useState('');

  useEffect(() => {
    let active = true;
    landlordApi.getPolicies()
      .then((res) => { if (active) setPolicies(res.data || []); })
      .catch((error) => { if (active) setPolicyError(error.message || 'Could not load building policies.'); });
    return () => { active = false; };
  }, []);

  const handlePublishPolicy = async (formData) => {
    const res = await landlordApi.publishPolicy(formData);
    setPolicies((current) => [res.data, ...current]);
  };

  const handleArchivePolicy = async (policy) => {
    if (!window.confirm(`Archive "${policy.title}"? Residents will no longer see it.`)) return;
    try {
      const res = await landlordApi.archivePolicy(policy.id);
      setPolicies((current) => current.map((p) => (String(p.id) === String(policy.id) ? { ...p, ...res.data, properties: p.properties } : p)));
    } catch (error) {
      setPolicyError(error.message || 'Could not archive this policy.');
    }
  };

  const openPolicyFile = async (policy) => {
    try {
      const blob = await landlordApi.getPolicyFile(policy.id);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (error) {
      setPolicyError(error.message || 'Could not open this policy.');
    }
  };

  useEffect(() => {
    if (documentsProp) {
      setDocuments(documentsProp);
    }
  }, [documentsProp]);

  useEffect(() => {
    let active = true;
    landlordApi.getComplianceReminderSettings()
      .then((response) => {
        if (active) setDocExpirationReminderDays(String(response.data?.noticeLeadTimeDays || 30));
      })
      .catch((error) => console.warn('Could not load compliance reminder settings:', error.message));
    return () => { active = false; };
  }, []);

  const handleReminderLeadTimeChange = async (value) => {
    setDocExpirationReminderDays(value);
    try {
      await landlordApi.updateComplianceReminderSettings(Number(value));
    } catch (error) {
      console.error('Could not save compliance reminder lead time:', error.message);
    }
  };

  const updateDocumentList = (newDocs) => setDocuments(newDocs);

  const [docStatusFilter, setDocStatusFilter] = useState('all'); // 'all' | 'Pending Review' | 'Verified' | 'Rejected'
  const [docCategoryFilter, setDocCategoryFilter] = useState('all');
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [selectedDocForInspection, setSelectedDocForInspection] = useState(null);
  const [signatureDoc, setSignatureDoc] = useState(null);
  const [leaseUploadOpen, setLeaseUploadOpen] = useState(false);
  const [leaseUploadUnitId, setLeaseUploadUnitId] = useState('');
  const [leaseUploadFile, setLeaseUploadFile] = useState(null);
  const [leaseUploadBusy, setLeaseUploadBusy] = useState(false);
  const occupiedUnits = units.filter((unit) => unit.tenant || unit.tenantId || unit.tenant?._id);

  const handleLeasePdfUpload = async (event) => {
    event.preventDefault();
    if (!leaseUploadFile || !leaseUploadUnitId) return;
    setLeaseUploadBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', leaseUploadFile);
      formData.append('unitId', leaseUploadUnitId);
      formData.append('name', leaseUploadFile.name);
      const response = await landlordApi.uploadLeasePdf(formData);
      const uploaded = response.data;
      updateDocumentList([{
        ...uploaded,
        id: uploaded.id || uploaded._id,
        tenantName: uploaded.tenantName || 'Resident',
        category: 'lease',
        type: 'Lease Agreement',
        status: uploaded.status || 'Pending Review',
        date: new Date(uploaded.createdAt || Date.now()).toLocaleDateString(),
      }, ...documents]);
      setLeaseUploadOpen(false);
      setLeaseUploadFile(null);
      setLeaseUploadUnitId('');
    } catch (error) {
      console.error('Could not upload lease PDF:', error.message);
      window.alert(error.message || 'Could not upload lease PDF.');
    } finally {
      setLeaseUploadBusy(false);
    }
  };

  // Review decisions are saved by the server first; the list changes only on success.
  const submitReview = async (docId, status, reason) => {
    if (!onUpdateDocumentStatus) return false;
    setReviewError('');
    setReviewingId(docId);
    try {
      await onUpdateDocumentStatus(docId, status, reason);
      return true;
    } catch (error) {
      setReviewError(error.message || 'Could not save the review decision. The document status was not changed.');
      return false;
    } finally {
      setReviewingId(null);
    }
  };

  const handleVerifyDocument = (docId) => submitReview(docId, 'Verified');
  const handleRejectDocument = (docId, reason) => submitReview(docId, 'Rejected', reason);

  return (
    <div className="space-y-6">
      
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
            Review resident compliance submissions (Government ID, Renter Insurance, Income Proof) and issue verification decisions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setLeaseUploadOpen(true)} className="px-4 py-2.5 rounded-2xl border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-grotesk font-bold text-xs flex items-center gap-2 btn-press shrink-0">
            <Upload className="w-4 h-4" /> Upload lease PDF
          </button>
          <button type="button" onClick={() => setIsPublishModalOpen(true)} className="btn btn-primary font-grotesk text-xs flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Publish building policy
          </button>
        </div>
      </div>

      {reviewError && (
        <div role="alert" className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{reviewError}</span>
          <button type="button" onClick={() => setReviewError('')} className="font-semibold underline">Dismiss</button>
        </div>
      )}

      {/* Metric Stats Bar */}
      {(() => {
        const pendingCount = documents.filter(d => d.status === 'Pending Review').length;
        const verifiedCount = documents.filter(d => d.status === 'Verified').length;
        const rejectedCount = documents.filter(d => d.status === 'Rejected').length;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-1">
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider block">Total Vault Files</span>
              <strong className="text-xl text-slate-900 dark:text-white font-grotesk block">{documents.length}</strong>
              <span className="text-xs text-slate-500 font-mono">Resident & Property Files</span>
            </div>

            <div className="p-4 rounded-2xl apple-glass top-shade border border-amber-500/30 bg-amber-500/5 space-y-1 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold uppercase tracking-wider block">
                  Pending Review
                </span>
                {pendingCount > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                )}
              </div>
              <strong className="text-2xl text-amber-600 dark:text-amber-400 font-grotesk block">{pendingCount}</strong>
              <span className="text-xs text-amber-700/80 dark:text-amber-400/80 font-mono">Action Required by Landlord</span>
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
                Rejected / Flagged
              </span>
              <strong className="text-2xl text-rose-600 dark:text-rose-400 font-grotesk block">{rejectedCount}</strong>
              <span className="text-xs text-rose-700/80 dark:text-rose-400/80 font-mono">Awaiting Resident Re-upload</span>
            </div>
          </div>
        );
      })()}

      {/* Filters & Search Toolbar */}
      <div className="p-4 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-3 text-xs font-mono">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-2xl bg-slate-200/60 dark:bg-surface border border-slate-300/60 dark:border-slate-800 overflow-x-auto w-full md:w-auto">
          {[
            { key: 'all', label: `All (${documents.length})` },
            { key: 'Pending Review', label: `Pending (${documents.filter(d => d.status === 'Pending Review').length})` },
            { key: 'Verified', label: `Verified (${documents.filter(d => d.status === 'Verified').length})` },
            { key: 'Rejected', label: `Rejected (${documents.filter(d => d.status === 'Rejected').length})` },
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
              placeholder="Search title or resident..."
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
          </select>
        </div>
      </div>

      {/* Master Documents Verification Table */}
      {(() => {
        const filteredDocs = documents.filter(d => {
          const matchesStatus = docStatusFilter === 'all' || d.status === docStatusFilter;
          const matchesCategory = docCategoryFilter === 'all' || d.type === docCategoryFilter;
          const q = docSearchQuery.toLowerCase();
          const matchesSearch = (d.name || '').toLowerCase().includes(q) || (d.tenantName || '').toLowerCase().includes(q) || (d.unitLabel || '').toLowerCase().includes(q);
          return matchesStatus && matchesCategory && matchesSearch;
        });

        return (
          <div className="border border-slate-200 dark:border-slate-800/80 rounded-3xl overflow-hidden apple-glass top-shade shadow-xl">
            {filteredDocs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <FileText className="w-10 h-10 text-slate-400 mx-auto stroke-1" />
                <p className="font-grotesk font-bold text-slate-700 dark:text-slate-300 text-base">
                  No documents found matching filters
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  Try adjusting your status, search, or document category selections above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredDocs.map((docItem) => (
                  <div 
                    key={docItem.id}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors font-mono text-xs hover:bg-slate-50/80 dark:hover:bg-slate-900/40 ${
                      docItem.status === 'Pending Review' ? 'bg-amber-500/[0.03]' : ''
                    }`}
                  >
                    {/* Doc Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        docItem.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                        docItem.status === 'Rejected' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
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
                          Resident: <strong className="text-slate-800 dark:text-slate-200">{docItem.tenantName}</strong> &bull; {docItem.unitLabel} ({docItem.propertyName})
                        </p>

                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          <span>Submitted: {docItem.date}</span>
                          <span>&bull;</span>
                          <span>Size: {docItem.size}</span>
                          {docItem.reviewerName && (
                            <>
                              <span>&bull;</span>
                              <span>Reviewer: {docItem.reviewerName}</span>
                            </>
                          )}
                        </div>

                        {docItem.status === 'Rejected' && docItem.rejectionReason && (
                          <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 mt-1 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>Rejection Feedback: <em>{docItem.rejectionReason}</em></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status & Action Buttons */}
                    <div className="flex items-center gap-2.5 shrink-0 justify-end">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 ${
                        docItem.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' :
                        docItem.status === 'Rejected' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20' :
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                        {docItem.status === 'Verified' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
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

                      {docItem.hasSignedCopy && <button type="button" onClick={async () => { try { const blob = await landlordApi.getLandlordDocumentFile(docItem.id || docItem._id, 'signed'); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); } catch (error) { setReviewError(error.message || 'Could not open the signed copy.'); } }} className="flex items-center gap-1.5 rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"><FileCheck size={14}/>Signed copy</button>}
                      {/\.pdf$/i.test(docItem.name || '') && <button type="button" onClick={() => setSignatureDoc(docItem)} className="btn btn-secondary btn-sm"><PenTool size={14}/>{docItem.landlordSigningRecord?.signedAt && docItem.signingRecord?.signedAt ? 'Signed by both' : docItem.signaturePlacement?.placedAt || docItem.landlordSignaturePlacement?.placedAt ? 'Signatures' : 'Add signatures'}</button>}

                      {docItem.status === 'Pending Review' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyDocument(docItem.id)}
                          disabled={reviewingId === docItem.id}
                          aria-label={`Verify ${docItem.name}`}
                          className="disabled:opacity-50 p-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 btn-press"
                          title="Quick Verify"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Building Policies */}
      <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
        <div>
          <h3 className="text-sm font-bold font-grotesk text-slate-900 dark:text-white">Building policies</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">PDFs you publish here appear in the Documents tab of active residents at the selected properties.</p>
        </div>
        {policyError && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300">{policyError}</div>}
        {policies.length === 0 ? (
          <p className="text-xs text-slate-500">No policies published yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {policies.map((policy) => (
              <li key={policy.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <strong className="block font-grotesk text-sm text-slate-900 dark:text-white truncate">{policy.title}</strong>
                  <span className="text-slate-500">{policy.type} · {(policy.properties || []).map((p) => p.name).join(', ') || 'Properties'} · {policy.size}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2.5 py-1 rounded-full font-mono uppercase ${policy.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>{policy.status}</span>
                  <button type="button" onClick={() => openPolicyFile(policy)} className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> View</button>
                  {policy.status === 'active' && (
                    <button type="button" onClick={() => handleArchivePolicy(policy)} className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center gap-1.5"><Archive className="w-3.5 h-3.5" /> Archive</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PublishPolicyModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onPublish={handlePublishPolicy}
        properties={properties}
      />

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
          <select
            value={docExpirationReminderDays}
            onChange={(e) => handleReminderLeadTimeChange(e.target.value)}
            className="bg-white dark:bg-surface border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-1.5 text-slate-900 dark:text-white text-xs font-mono shrink-0"
          >
            <option value="15">15 Days Before Expiry</option>
            <option value="30">30 Days Before Expiry</option>
            <option value="60">60 Days Before Expiry</option>
          </select>
        </div>
      </div>

      {leaseUploadOpen && <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/70 p-4">
        <form onSubmit={handleLeasePdfUpload} className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-950">
          <div><h2 className="text-lg font-bold">Upload lease PDF</h2><p className="mt-1 text-sm text-slate-500">Choose an occupied unit with an active lease. The tenant will be able to view and sign it.</p></div>
          <label className="block text-sm font-medium">Occupied unit<select required value={leaseUploadUnitId} onChange={(event) => setLeaseUploadUnitId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"><option value="">Select unit</option>{occupiedUnits.map((unit) => <option key={unit._id || unit.id} value={unit._id || unit.id}>{unit.property?.name || unit.propertyName || 'Property'} · {unit.label || unit.name} · {unit.tenant?.firstName ? `${unit.tenant.firstName} ${unit.tenant.lastName || ''}` : 'Occupied'}</option>)}</select></label>
          <label className="block text-sm font-medium">Lease PDF<input required type="file" accept="application/pdf,.pdf" onChange={(event) => setLeaseUploadFile(event.target.files?.[0] || null)} className="mt-1.5 block w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700"/><span className="mt-1 block text-xs text-slate-500">PDF only, maximum 15 MB.</span></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setLeaseUploadOpen(false)} className="btn btn-secondary border text-sm">Cancel</button><button disabled={leaseUploadBusy || !occupiedUnits.length} className="btn btn-primary text-sm">{leaseUploadBusy ? 'Uploading…' : 'Upload PDF'}</button></div>
        </form>
      </div>}

      {/* Render Inspection Modal */}
      {selectedDocForInspection && (
        <DocumentInspectionModal
          document={selectedDocForInspection}
          onClose={() => setSelectedDocForInspection(null)}
          onVerify={handleVerifyDocument}
          onReject={handleRejectDocument}
        />
      )}
      {signatureDoc && <SignaturePlacementModal document={signatureDoc} landlordName={landlordName} onClose={() => setSignatureDoc(null)} onSaved={(result = {}) => setDocuments((current) => current.map((doc) => String(doc.id || doc._id) === String(signatureDoc.id || signatureDoc._id) ? {
        ...doc,
        ...(result.signaturePlacement ? { signaturePlacement: result.signaturePlacement } : {}),
        ...(result.landlordSignaturePlacement ? { landlordSignaturePlacement: result.landlordSignaturePlacement } : {}),
        ...(result.landlordSigningRecord ? { landlordSigningRecord: result.landlordSigningRecord } : {}),
        ...(result.hasSignedCopy ? { hasSignedCopy: true } : {}),
      } : doc))} />}

    </div>
  );
};
