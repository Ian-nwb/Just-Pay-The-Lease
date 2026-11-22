import React, { useState, useEffect } from 'react';
import {
  Layers, Plus, Search, Edit2, Power, RotateCcw, Trash2, X, Check,
  AlertCircle, RefreshCw, Home, User, DollarSign, Filter
} from 'lucide-react';
import {
  getUnits, createUnit, updateUnit, setUnitActive, deleteUnit, getProperties, getUsersLookup
} from '../services/superadminApi';
import { Skeleton } from './ui/SkeletonLoader';

const STATUS_CHOICES = [
  { value: 'vacant', label: 'Vacant', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'occupied', label: 'Occupied', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  { value: 'maintenance', label: 'Maintenance', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
];

export const UnitsTab = () => {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Lookups
  const [propertiesList, setPropertiesList] = useState([]);
  const [tenantsList, setTenantsList] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    property: '',
    monthlyRent: '',
    sqft: '',
    bedrooms: 1,
    bathrooms: 1,
    status: 'vacant',
    tenant: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState(null);

  const fetchUnitsData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getUnits({
        search,
        propertyId: propertyFilter,
        status: statusFilter,
      });
      setUnits(data.units || []);
    } catch (err) {
      setError(err.message || 'Failed to load units');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const [propsData, usersData] = await Promise.all([
        getProperties(),
        getUsersLookup(),
      ]);
      setPropertiesList(propsData.properties || []);
      setTenantsList(usersData.tenants || []);
    } catch (err) {
      console.error('Failed to load lookup data:', err);
    }
  };

  useEffect(() => {
    fetchUnitsData();
  }, [search, propertyFilter, statusFilter]);

  useEffect(() => {
    fetchLookups();
  }, []);

  const openCreateModal = () => {
    setEditingUnit(null);
    setFormData({
      label: '',
      property: propertiesList[0]?._id || '',
      monthlyRent: '',
      sqft: '',
      bedrooms: 1,
      bathrooms: 1,
      status: 'vacant',
      tenant: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (unit) => {
    setEditingUnit(unit);
    setFormData({
      label: unit.label || '',
      property: unit.property?._id || unit.property || '',
      monthlyRent: unit.monthlyRent || '',
      sqft: unit.sqft || '',
      bedrooms: unit.bedrooms || 0,
      bathrooms: unit.bathrooms || 1,
      status: unit.status || 'vacant',
      tenant: unit.tenant?._id || unit.tenant || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        ...formData,
        monthlyRent: Number(formData.monthlyRent),
        sqft: Number(formData.sqft),
        bedrooms: Number(formData.bedrooms),
        bathrooms: Number(formData.bathrooms),
        tenant: formData.tenant || null,
      };

      if (editingUnit) {
        await updateUnit(editingUnit._id, payload);
        setSuccessMsg(`Unit "${formData.label}" updated successfully.`);
      } else {
        await createUnit(payload);
        setSuccessMsg(`Unit "${formData.label}" created successfully.`);
      }
      setIsModalOpen(false);
      await fetchUnitsData();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (unit) => {
    const shouldActivate = unit.isActive === false;
    const action = shouldActivate ? 'reactivate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} unit "${unit.label}"? ${shouldActivate ? 'The unit will become available for new operations.' : 'Occupied units cannot be deactivated; records will be preserved.'}`)) {
      return;
    }

    setChangingStatusId(unit._id);
    try {
      await setUnitActive(unit._id, shouldActivate);
      setSuccessMsg(`Unit "${unit.label}" ${shouldActivate ? 'reactivated' : 'deactivated'} successfully.`);
      await fetchUnitsData();
    } catch (err) {
      setError(err.message || `Failed to ${action} unit`);
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleDelete = async (unit) => {
    if (!window.confirm(`Permanently delete unit "${unit.label}"? This cannot be undone. Assigned or occupied units and units with lease history are protected.`)) return;
    setChangingStatusId(unit._id);
    try {
      await deleteUnit(unit._id);
      setSuccessMsg(`Unit "${unit.label}" permanently deleted.`);
      await fetchUnitsData();
    } catch (err) {
      setError(err.message || 'Failed to delete unit');
    } finally {
      setChangingStatusId(null);
    }
  };

  const getStatusBadge = (status) => {
    const choice = STATUS_CHOICES.find((s) => s.value === status) || STATUS_CHOICES[0];
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${choice.badge}`}>
        {choice.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-line rounded-3xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-grotesk text-ink-strong">Units Inventory</h2>
          </div>
          <p className="text-xs text-ink-muted font-sans">
            Manage individual apartment units, suites, square footage, occupancy state, and assigned tenants.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUnitsData}
            className="p-2.5 rounded-xl bg-surface hover:bg-surface-hover text-ink-soft border border-line transition btn-press cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="btn btn-primary font-grotesk text-xs flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Unit</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="cursor-pointer text-ink-muted hover:text-ink-strong">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="cursor-pointer text-ink-muted hover:text-ink-strong">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-surface border border-line rounded-2xl p-4">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by unit label (e.g. Unit 14B)..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-strong  focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">All Properties</option>
            {propertiesList.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="">All Statuses</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Units Table */}
      <div className="bg-surface border border-line rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-sunken border-b border-line text-ink-muted uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-5">Unit Label</th>
                <th className="py-3.5 px-5">Parent Property</th>
                <th className="py-3.5 px-5">Monthly Rent</th>
                <th className="py-3.5 px-5">Dimensions</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5">Assigned Resident</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && units.length === 0 ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-32" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-24" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20 rounded-full" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3.5 px-5 text-right"><Skeleton className="h-7 w-16 ml-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : units.length === 0 ? (
                <tr>
                    <td colSpan={7} className="text-center py-12 text-ink-muted">
                    No units found matching criteria.
                  </td>
                </tr>
              ) : (
                units.map((unit) => (
                  <tr key={unit._id} className="hover:bg-surface-hover transition">
                    <td className="py-3.5 px-5 font-bold font-grotesk text-ink-strong text-sm">
                      {unit.label}
                    </td>
                    <td className="py-3.5 px-5 text-ink-soft">
                      <div className="flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-ink-muted" />
                        <span>{unit.property?.name || 'Unassigned Property'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-emerald-400 font-bold">
                      ${Number(unit.monthlyRent || 0).toLocaleString()} /mo
                    </td>
                    <td className="py-3.5 px-5 text-ink-muted">
                      <span>{unit.sqft} sqft &bull; {unit.bedrooms}b/{unit.bathrooms}ba</span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex flex-col items-start gap-1">
                        {getStatusBadge(unit.status)}
                        {unit.isActive === false && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300">Inactive</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      {unit.tenant ? (
                        <div className="flex items-center gap-1.5 text-ink-soft">
                          <User className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{unit.tenant.firstName} {unit.tenant.lastName}</span>
                        </div>
                      ) : (
                        <span className="text-ink-muted italic">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(unit)}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-slate-700 text-purple-400 transition cursor-pointer"
                          title="Edit Unit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(unit)}
                          disabled={changingStatusId === unit._id || (unit.isActive !== false && (Boolean(unit.tenant) || unit.status === 'occupied'))}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-amber-900/40 text-amber-300 transition cursor-pointer disabled:opacity-50"
                          title={unit.isActive === false ? 'Reactivate Unit' : (unit.tenant || unit.status === 'occupied') ? 'Move out or unassign the tenant before deactivation' : 'Deactivate Unit'}
                        >
                          {unit.isActive === false ? <RotateCcw className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(unit)}
                          disabled={changingStatusId === unit._id || Boolean(unit.tenant) || unit.status === 'occupied'}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-red-900/40 text-red-300 transition cursor-pointer disabled:opacity-50"
                          title={unit.tenant || unit.status === 'occupied' ? 'Move out or unassign the tenant before deletion' : 'Permanently delete unit'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-line rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold font-grotesk text-ink-strong flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                <span>{editingUnit ? 'Edit Unit' : 'Create New Unit'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink-strong cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Unit Label</label>
                  <input
                    type="text"
                    required
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g. Unit 14B"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Parent Property</label>
                  <select
                    required
                    value={formData.property}
                    onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="">Select Property</option>
                    {propertiesList.map((p) => (
                      <option key={p._id} value={p._id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Monthly Rent ($)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formData.monthlyRent}
                    onChange={(e) => setFormData({ ...formData, monthlyRent: e.target.value })}
                    placeholder="e.g. 2400"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Square Footage</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.sqft}
                    onChange={(e) => setFormData({ ...formData, sqft: e.target.value })}
                    placeholder="e.g. 850"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Bedrooms</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.bedrooms}
                    onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Bathrooms</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.bathrooms}
                    onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Occupancy Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-ink-muted block font-semibold">Assign Tenant (Optional)</label>
                <select
                  value={formData.tenant}
                  onChange={(e) => setFormData({ ...formData, tenant: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  <option value="">No Assigned Resident</option>
                  {tenantsList.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.firstName} {t.lastName} ({t.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-hover hover:bg-slate-700 text-ink-soft font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary font-grotesk cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingUnit ? 'Save Changes' : 'Create Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default UnitsTab;
