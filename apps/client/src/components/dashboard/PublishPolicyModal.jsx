import React, { useState } from 'react';
import { 
  X, UploadCloud, FileText, CheckCircle2, ShieldCheck, 
  Building2, FileCheck, File, Loader2, Megaphone
} from 'lucide-react';

export const PublishPolicyModal = ({
  isOpen,
  onClose,
  onPublish,
  properties = [],
}) => {
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('House Rules');
  const [targetScope, setTargetScope] = useState('all');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const [submitError, setSubmitError] = useState('');

  // Waits for the server; the form stays open with an error if publishing fails.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!docTitle.trim() || !selectedFile) return;
    setSubmitError('');
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', docTitle.trim());
      formData.append('type', docType);
      formData.append('propertyId', targetScope);
      formData.append('notes', notes.trim());
      await onPublish(formData);
      setDocTitle('');
      setDocType('House Rules');
      setNotes('');
      setSelectedFile(null);
      onClose();
    } catch (error) {
      setSubmitError(error.message || 'Could not publish this policy.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-fadeIn overflow-y-auto">
      
      {/* Modal Container */}
      <div 
        className="w-full max-w-lg bg-white dark:bg-surface rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800/90 overflow-hidden apple-glass top-shade my-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-semibold">
                <FileCheck className="w-3 h-3" />
                <span>Landlord Document Publisher</span>
              </div>
              <h2 className="text-xl font-extrabold font-grotesk text-slate-900 dark:text-white mt-0.5">
                Publish Building Policy & Rules
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors btn-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono text-xs">
          {submitError && <div role="alert" className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300">{submitError}</div>}
          
          {/* Document Title */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 font-bold font-grotesk">
              Document Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="e.g. Building_House_Rules_v4_2026"
              className="w-full bg-slate-50 dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
            />
          </div>

          {/* Document Type Dropdown */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 font-bold font-grotesk">
              Policy Classification <span className="text-rose-500">*</span>
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full bg-slate-50 dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
            >
              <option value="House Rules">Building House Rules & Bylaws</option>
              <option value="Lease Addendum">Standard Lease Addendum</option>
              <option value="Move-Out Guide">Move-Out Checklist & Guidelines</option>
              <option value="Parking Policy">Parking & Storage Policy</option>
              <option value="General Policy">General Property Policy</option>
            </select>
          </div>

          {/* Target Audience Scope */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 font-bold font-grotesk">
              Publishing Scope
            </label>
            <select
              value={targetScope}
              onChange={(e) => setTargetScope(e.target.value)}
              className="w-full bg-slate-50 dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
            >
              <option value="all">All my active properties</option>
              {properties.map(p => (
                <option key={p.id || p._id} value={p.id || p._id}>{p.name} residents only</option>
              ))}
            </select>
          </div>

          {/* Drag & Drop File Zone */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 font-bold font-grotesk">
              Attach PDF (max 15 MB) <span className="text-rose-500">*</span>
            </label>
            
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-2xl p-5 text-center transition-all cursor-pointer relative
                ${isDragOver 
                  ? 'border-indigo-500 bg-indigo-500/10' 
                  : 'border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-surface-hover/50 hover:border-indigo-400 dark:hover:border-indigo-500/50'
                }
              `}
            >
              <input
                type="file"
                onChange={handleFileChange}
                accept="application/pdf,.pdf"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />

              {selectedFile ? (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <File className="w-5 h-5 shrink-0 text-indigo-500" />
                    <div className="min-w-0">
                      <strong className="text-slate-900 dark:text-white font-grotesk text-xs block truncate">
                        {selectedFile.name}
                      </strong>
                      <span className="text-xs text-slate-500 font-mono">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Selected
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pointer-events-none">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 mx-auto flex items-center justify-center">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-grotesk font-bold text-slate-800 dark:text-slate-200 block text-xs">
                      Click to browse or drag and drop official document PDF
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Supports PDF, PNG, JPG (Max file size: 15MB)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description & Executive Summary */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 font-bold font-grotesk">
              Summary / Implementation Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Effective starting September 1st, 2026. Applies to all residential units."
              className="w-full bg-slate-50 dark:bg-surface-hover border border-slate-300 dark:border-slate-800 rounded-xl p-2.5 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-grotesk font-semibold text-xs btn-press"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || !docTitle.trim() || !selectedFile}
              className="btn btn-brand btn-icon px-6 py-2.5 font-grotesk text-xs flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span>Publish Official Policy</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>

    </div>
  );
};
