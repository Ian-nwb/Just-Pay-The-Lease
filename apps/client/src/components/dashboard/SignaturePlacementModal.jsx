import React, { useEffect, useRef, useState } from 'react';
import { Move, X, PenLine, CheckCircle2 } from 'lucide-react';
import { landlordApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { SignaturePad } from '../common/SignaturePad';

const BOX = { width: 0.24, height: 0.08 };
const ROLES = {
  tenant: { label: 'Tenant signature', field: 'signaturePlacement', record: 'signingRecord', tone: 'border-blue-600 bg-blue-500/15 text-blue-800 dark:text-blue-200' },
  landlord: { label: 'Landlord signature', field: 'landlordSignaturePlacement', record: 'landlordSigningRecord', tone: 'border-emerald-700 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200' },
};

// Read the first page's MediaBox so the preview frame matches the page shape.
// Falls back to US Letter when the PDF stores it in a compressed object stream.
async function pageAspect(blob) {
  try {
    const head = new TextDecoder('latin1').decode(await blob.slice(0, Math.min(blob.size, 2_000_000)).arrayBuffer());
    const m = head.match(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/);
    if (m) {
      const w = Number(m[3]) - Number(m[1]);
      const h = Number(m[4]) - Number(m[2]);
      if (w > 0 && h > 0) return w / h;
    }
  } catch { /* fall back below */ }
  return 612 / 792;
}

const initialPosition = (doc, role) => {
  const p = doc[ROLES[role].field];
  if (p?.placedAt) return { page: Number(p.page || 1), x: Number(p.x), y: Number(p.y), placed: true };
  return { page: 1, x: role === 'tenant' ? 0.1 : 0.58, y: 0.8, placed: false };
};

export function SignaturePlacementModal({ document: doc, onClose, onSaved, landlordName = '' }) {
  const toast = useToast();
  const [pdfUrl, setPdfUrl] = useState('');
  const [aspect, setAspect] = useState(612 / 792);
  const [boxes, setBoxes] = useState({ tenant: initialPosition(doc, 'tenant'), landlord: initialPosition(doc, 'landlord') });
  const [enabled, setEnabled] = useState({ tenant: true, landlord: true });
  const [page, setPage] = useState(boxes.tenant.page || 1);
  const [dragging, setDragging] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signName, setSignName] = useState(landlordName);
  const [signatureImage, setSignatureImage] = useState('');
  const frame = useRef(null);
  const docId = doc.id || doc._id;
  const tenantSigned = Boolean(doc.signingRecord?.signedAt);
  const landlordSigned = Boolean(doc.landlordSigningRecord?.signedAt);
  // Show completed signatures as the actual drawn/uploaded image inside their box.
  const [sigImages, setSigImages] = useState({});
  useEffect(() => {
    const urls = [];
    let active = true;
    for (const role of ['tenant', 'landlord']) {
      const signed = role === 'tenant' ? tenantSigned : landlordSigned;
      if (!signed) continue;
      landlordApi.getSignatureImage(docId, role).then((blob) => {
        const url = URL.createObjectURL(blob);
        urls.push(url);
        if (active) setSigImages((cur) => ({ ...cur, [role]: url }));
      }).catch(() => { /* older typed-only signatures have no image */ });
    }
    return () => { active = false; urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [docId, tenantSigned, landlordSigned]);

  useEffect(() => {
    let objectUrl;
    let active = true;
    landlordApi.getLandlordDocumentFile(docId).then(async (blob) => {
      const ratio = await pageAspect(blob);
      objectUrl = URL.createObjectURL(blob);
      if (active) { setAspect(ratio); setPdfUrl(objectUrl); }
    }).catch((error) => toast.error(error.message || 'Could not load the PDF'));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveTo = (event) => {
    if (!dragging || !frame.current) return;
    const b = frame.current.getBoundingClientRect();
    const x = Math.min(1 - BOX.width, Math.max(0, (event.clientX - b.left) / b.width - BOX.width / 2));
    const y = Math.min(1 - BOX.height, Math.max(0, (event.clientY - b.top) / b.height - BOX.height / 2));
    setBoxes((cur) => ({ ...cur, [dragging]: { ...cur[dragging], x, y, page } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      let latest = {};
      for (const role of ['tenant', 'landlord']) {
        const signed = role === 'tenant' ? tenantSigned : landlordSigned;
        if (!enabled[role] || signed) continue;
        const b = boxes[role];
        const res = await landlordApi.setDocumentSignaturePlacement(docId, { role, page: b.page || page, x: b.x, y: b.y, ...BOX });
        latest = res.data;
      }
      onSaved(latest);
      toast.success('Signature boxes saved.');
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not save signature placement');
    } finally {
      setBusy(false);
    }
  };

  const signNow = async () => {
    setBusy(true);
    try {
      const b = boxes.landlord;
      if (!doc.landlordSignaturePlacement?.placedAt) {
        await landlordApi.setDocumentSignaturePlacement(docId, { role: 'landlord', page: b.page || page, x: b.x, y: b.y, ...BOX });
      }
      const res = await landlordApi.signAsLandlord(docId, signName.trim(), signatureImage);
      onSaved({ landlordSignaturePlacement: { ...b, placedAt: new Date().toISOString() }, ...res.data });
      toast.success(res.data?.hasSignedCopy ? 'Signed. A signed copy was created.' : 'Signed. Your signature is recorded.');
      onClose();
    } catch (error) {
      toast.error(error.message || 'Could not sign');
    } finally {
      setBusy(false);
    }
  };

  const viewerSrc = pdfUrl ? `${pdfUrl}#page=${page}&toolbar=0&navpanes=0&scrollbar=0&view=Fit&zoom=page-fit` : '';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="signature-placement-title" className="card-pop flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-line p-4">
          <div>
            <h2 id="signature-placement-title" className="font-semibold text-ink-strong">Signatures · {doc.name}</h2>
            <p className="mt-1 text-xs text-ink-muted">Drag each box to where that person should sign, on the page shown. The typed name and time are recorded; this does not claim legal compliance.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon"><X size={16} /></button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_20rem]">
          {/* Page preview with draggable boxes */}
          <div className="min-h-0 overflow-auto bg-surface-hover p-4">
            <div
              ref={frame}
              onPointerMove={moveTo}
              onPointerUp={() => setDragging(null)}
              className="relative mx-auto w-full max-w-[640px] touch-none overflow-hidden rounded-md border border-line bg-white shadow-sm"
              style={{ aspectRatio: String(aspect) }}
            >
              {pdfUrl
                ? <iframe title={`${doc.name} page ${page}`} src={viewerSrc} className="pointer-events-none absolute inset-0 h-full w-full" />
                : <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-muted">Loading PDF…</p>}
              {Object.entries(ROLES).map(([role, cfg]) => {
                const b = boxes[role];
                const signed = role === 'tenant' ? tenantSigned : landlordSigned;
                if (!enabled[role] || (b.page || 1) !== page) return null;
                return (
                  <button
                    key={role}
                    type="button"
                    disabled={signed}
                    onPointerDown={(e) => { e.preventDefault(); setDragging(role); e.currentTarget.setPointerCapture(e.pointerId); }}
                    onPointerUp={() => setDragging(null)}
                    style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${BOX.width * 100}%`, height: `${BOX.height * 100}%` }}
                    className={`absolute z-10 flex items-center justify-center gap-1.5 rounded-md border-2 border-dashed text-[11px] font-semibold shadow-sm ${cfg.tone} ${signed ? 'cursor-default border-solid' : 'cursor-grab active:cursor-grabbing'}`}
                    aria-label={`${cfg.label}${signed ? ' (signed)' : ', drag to move'}`}
                  >
                    {signed ? (
                      <span className="flex h-full w-full flex-col items-center justify-center bg-white/90 px-1">
                        {sigImages[role]
                          ? <img src={sigImages[role]} alt={`${cfg.label} by ${doc[cfg.record]?.signedName}`} className="max-h-[70%] max-w-full object-contain" />
                          : <span className="font-serif text-sm italic text-ink-strong">{doc[cfg.record]?.signedName}</span>}
                        <span className="flex items-center gap-1 text-[9px] font-medium text-ink-muted"><CheckCircle2 size={10} /> {doc[cfg.record]?.signedName} · {new Date(doc[cfg.record]?.signedAt).toLocaleDateString()}</span>
                      </span>
                    ) : (<><Move size={13} /> {cfg.label}</>)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Controls */}
          <aside className="space-y-5 overflow-y-auto border-t border-line p-4 text-sm lg:border-l lg:border-t-0">
            <label className="block text-xs font-semibold text-ink-soft">Page shown
              <input type="number" min="1" value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-24 rounded-lg border px-2 py-1.5" />
            </label>

            {Object.entries(ROLES).map(([role, cfg]) => {
              const signed = role === 'tenant' ? tenantSigned : landlordSigned;
              const record = doc[cfg.record];
              return (
                <div key={role} className="space-y-1.5">
                  <label className="flex items-center justify-between gap-2 font-medium text-ink">
                    {cfg.label}
                    <input type="checkbox" checked={enabled[role]} disabled={signed} onChange={(e) => setEnabled((cur) => ({ ...cur, [role]: e.target.checked }))} />
                  </label>
                  {signed
                    ? <span className="badge badge-success">Signed by {record.signedName} · {new Date(record.signedAt).toLocaleDateString()}</span>
                    : <p className="text-xs text-ink-muted">Box on page {boxes[role].page || page}. {enabled[role] ? (boxes[role].placed ? 'Saved; drag to adjust.' : 'Not saved yet.') : 'Not required.'}</p>}
                  {enabled[role] && !signed && (boxes[role].page || 1) !== page && (
                    <button type="button" onClick={() => setBoxes((cur) => ({ ...cur, [role]: { ...cur[role], page } }))} className="btn btn-ghost btn-sm px-0">Move to page {page}</button>
                  )}
                </div>
              );
            })}

            {!landlordSigned && enabled.landlord && (
              <div className="space-y-2 border-t border-line pt-4">
                <p className="font-medium text-ink">Sign as landlord</p>
                <SignaturePad onChange={setSignatureImage} />
                <input value={signName} onChange={(e) => setSignName(e.target.value)} maxLength={120} placeholder="Type your full name" className="w-full rounded-lg border px-3 py-2" aria-label="Your full name" />
                <button type="button" disabled={busy || !pdfUrl || !signName.trim() || !signatureImage} onClick={signNow} className="btn btn-primary w-full"><PenLine size={15} /> Sign now</button>
              </div>
            )}
          </aside>
        </div>

        <footer className="flex justify-end gap-2 border-t border-line p-3">
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
          <button disabled={busy || !pdfUrl} onClick={save} className="btn btn-brand">{busy ? 'Saving…' : 'Save boxes'}</button>
        </footer>
      </section>
    </div>
  );
}
