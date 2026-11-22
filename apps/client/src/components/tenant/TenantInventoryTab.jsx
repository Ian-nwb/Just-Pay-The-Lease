import React, { useEffect, useState } from 'react';
import { Check, ClipboardList, Image, MessageSquareWarning } from 'lucide-react';
import { tenantApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export function TenantInventoryTab() {
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState('');
  const toast = useToast();
  const refresh = () => tenantApi.getInventory().then((result) => setItems(result?.data || [])).catch((error) => toast.error(error.message));
  useEffect(() => { refresh(); }, []);
  const respond = async (item, response) => {
    setBusyId(item._id);
    try { await tenantApi.respondInventory(item._id, response, notes[item._id] || ''); toast.success(response === 'confirmed' ? 'Condition confirmed.' : 'Condition dispute sent to the landlord.'); await refresh(); }
    catch (error) { toast.error(error.message || 'Could not update the inventory item'); }
    finally { setBusyId(''); }
  };
  return <section className="space-y-4">
    <header><h1 className="text-2xl font-bold text-slate-900 dark:text-white">Unit inventory</h1><p className="mt-1 text-sm text-slate-500">Review the landlord’s move-in condition record and confirm or dispute each item.</p></header>
    {!items.length ? <div className="rounded-2xl border border-slate-200 p-10 text-center dark:border-slate-800"><ClipboardList className="mx-auto text-indigo-500"/><p className="mt-3 font-semibold">No inventory records yet</p><p className="mt-1 text-sm text-slate-500">The landlord can add labeled appliances and furniture here.</p></div> : <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">{items.map((item) => <article key={item._id} className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.label}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs capitalize dark:bg-slate-800">{String(item.condition).replace('_', ' ')}</span><span className="badge badge-info capitalize">{item.tenantResponse}</span></div>{item.notes && <p className="mt-1 text-sm text-slate-500">{item.notes}</p>}{item.photos?.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.photos.map((photo) => <a key={photo.publicId || photo.url} href={photo.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-indigo-600"><Image size={14}/>{photo.name || 'View photo'}</a>)}</div>}{item.tenantResponse === 'pending' && <textarea maxLength={2000} value={notes[item._id] || ''} onChange={(event) => setNotes({ ...notes, [item._id]: event.target.value })} placeholder="Add a note if there is an issue" className="mt-3 w-full rounded-xl border border-slate-300 bg-transparent p-3 text-sm dark:border-slate-700" rows={2}/ >}{item.tenantNote && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Your note: {item.tenantNote}</p>}</div>{item.tenantResponse === 'pending' && <div className="flex gap-2 sm:flex-col"><button disabled={busyId === item._id} onClick={() => respond(item, 'confirmed')} className="btn btn-primary flex min-h-11 items-center gap-2 text-sm"><Check size={16}/>Confirm</button><button disabled={busyId === item._id || (notes[item._id] || '').trim().length < 3} onClick={() => respond(item, 'disputed')} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50"><MessageSquareWarning size={16}/>Dispute</button></div>}</article>)}</div>}
  </section>;
}
