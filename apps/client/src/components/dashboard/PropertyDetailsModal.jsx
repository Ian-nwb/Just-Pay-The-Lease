import React, { useEffect } from 'react';
import { X, MapPin, Camera, PawPrint, Car, Clock3, Layers } from 'lucide-react';

const peso = (v) => `₱${Number(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80';

// Read-only overview of one property and its units, opened from the property card.
export const PropertyDetailsModal = ({ property, units = [], tenants = [], onClose, onChangeImage, onAddUnit }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!property) return null;
  const propUnits = units.filter((u) => String(u.propertyId || u.property?._id || u.property?.id || u.property) === String(property.id || property._id));
  const occupied = propUnits.filter((u) => u.status === 'occupied').length;
  const rate = propUnits.length ? Math.round((occupied / propUnits.length) * 100) : 0;
  const monthlyRent = propUnits.filter((u) => u.status === 'occupied').reduce((sum, u) => sum + Number(u.monthlyRent || 0), 0);
  const tenantName = (u) => {
    if (u.tenant && typeof u.tenant === 'object') return `${u.tenant.firstName || ''} ${u.tenant.lastName || ''}`.trim() || u.tenant.name || 'Tenant';
    const t = tenants.find((x) => String(x.id || x._id) === String(u.tenantId || u.tenant));
    return t?.name || u.tenantName || (u.status === 'occupied' ? 'Tenant' : '—');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="property-details-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface shadow-2xl">
        <div className="relative h-52 bg-slate-900">
          <img src={property.image || FALLBACK_IMAGE} alt={property.name} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-xl bg-slate-950/70 p-2 text-white border border-white/10"><X size={16} /></button>
          <button onClick={onChangeImage} className="absolute right-14 top-3 flex items-center gap-1.5 rounded-xl bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white border border-white/10"><Camera size={14} /> Change photo</button>
          <div className="absolute bottom-4 left-5 right-5">
            <span className="rounded-full bg-indigo-600/90 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">{property.category || 'Residential'}</span>
            <h2 id="property-details-title" className="mt-2 text-2xl font-extrabold text-white">{property.name}</h2>
            <p className="flex items-center gap-1 text-sm text-slate-300"><MapPin size={14} /> {property.address}, {property.city}</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[['Units', propUnits.length], ['Occupied', occupied], ['Occupancy', `${rate}%`], ['Monthly rent', peso(monthlyRent)]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-black p-3">
                <span className="block text-xs text-slate-500">{label}</span>
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">{value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5"><PawPrint size={13} /> Pets {property.petsAllowed ? 'allowed' : 'not allowed'}</span>
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5"><Car size={13} /> Parking {property.parkingAvailable ? 'available' : 'not available'}</span>
            <span className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5"><Clock3 size={13} /> {property.timezone || 'Asia/Manila'}</span>
            {property.renewalWindowDays != null && <span className="rounded-full border border-slate-200 dark:border-slate-800 px-3 py-1.5">Renewal window {property.renewalWindowDays} days</span>}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white">Units</h3>
              <button onClick={onAddUnit} className="btn btn-primary flex items-center gap-1.5 text-xs"><Layers size={13} /> Add unit</button>
            </div>
            {propUnits.length === 0 ? <p className="text-sm text-slate-500">No units yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="py-2">Unit</th><th>Status</th><th>Tenant</th><th className="text-right">Rent</th><th className="text-right">Lease ends</th></tr></thead>
                  <tbody>
                    {propUnits.map((u) => (
                      <tr key={u.id || u._id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-2 font-semibold">{u.label}</td>
                        <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${u.status === 'occupied' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>{u.status}</span></td>
                        <td>{tenantName(u)}</td>
                        <td className="text-right">{peso(u.monthlyRent)}</td>
                        <td className="text-right text-xs text-slate-500">{u.leaseEnd ? new Date(u.leaseEnd).toLocaleDateString('en-PH', { timeZone: 'UTC' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
