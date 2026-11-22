import React, { useState, useEffect } from 'react';
import {
  Building2, Plus, Search, Edit2, Power, RotateCcw, Trash2, X, Check,
  AlertCircle, RefreshCw, MapPin, User, Layers
} from 'lucide-react';
import {
  getProperties, createProperty, updateProperty, setPropertyActive, deleteProperty, getUsersLookup
} from '../services/superadminApi';
import { Skeleton } from './ui/SkeletonLoader';

const CATEGORIES = ['Residential', 'Luxury', 'Studio', 'Penthouse', 'Commercial'];

export const PropertiesTab = () => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Dropdown Lookups
  const [landlords, setLandlords] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    category: 'Residential',
    landlord: '',
    unitsCount: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const [changingStatusId, setChangingStatusId] = useState(null);

  const fetchPropertiesData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getProperties({ search, category: categoryFilter });
      setProperties(data.properties || []);
    } catch (err) {
      setError(err.message || 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const data = await getUsersLookup();
      setLandlords(data.landlords || []);
    } catch (err) {
      console.error('Failed to load landlords lookup:', err);
    }
  };

  useEffect(() => {
    fetchPropertiesData();
  }, [search, categoryFilter]);

  useEffect(() => {
    fetchLookups();
  }, []);

  const openCreateModal = () => {
    setEditingProperty(null);
    setFormData({
      name: '',
      address: '',
      city: '',
      category: 'Residential',
      landlord: landlords[0]?._id || '',
      unitsCount: 0,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (prop) => {
    setEditingProperty(prop);
    setFormData({
      name: prop.name || '',
      address: prop.address || '',
      city: prop.city || '',
      category: prop.category || 'Residential',
      landlord: prop.landlord?._id || prop.landlord || '',
      unitsCount: prop.unitsCount || 0,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      if (editingProperty) {
        await updateProperty(editingProperty._id, formData);
        setSuccessMsg(`Property "${formData.name}" updated successfully.`);
      } else {
        await createProperty(formData);
        setSuccessMsg(`Property "${formData.name}" created successfully.`);
      }
      setIsModalOpen(false);
      await fetchPropertiesData();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (property) => {
    const shouldActivate = property.status === 'inactive';
    const action = shouldActivate ? 'reactivate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} property "${property.name}"? ${shouldActivate ? 'It will become available for new operations.' : 'Occupied properties cannot be deactivated; existing records will be preserved.'}`)) {
      return;
    }

    setChangingStatusId(property._id);
    try {
      await setPropertyActive(property._id, shouldActivate);
      setSuccessMsg(`Property "${property.name}" ${shouldActivate ? 'reactivated' : 'deactivated'} successfully.`);
      await fetchPropertiesData();
    } catch (err) {
      setError(err.message || `Failed to ${action} property`);
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleDelete = async (property) => {
    if (!window.confirm(`Permanently delete property "${property.name}"? This cannot be undone. Properties with units must have eligible units deleted first.`)) return;
    setChangingStatusId(property._id);
    try {
      await deleteProperty(property._id);
      setSuccessMsg(`Property "${property.name}" permanently deleted.`);
      await fetchPropertiesData();
    } catch (err) {
      setError(err.message || 'Failed to delete property');
    } finally {
      setChangingStatusId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-line rounded-3xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-grotesk text-ink-strong">Properties Registry</h2>
          </div>
          <p className="text-xs text-ink-muted font-sans">
            Global management of real estate complexes, buildings, and property portfolios across all landlords.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPropertiesData}
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
            <span>Create Property</span>
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
            placeholder="Search by property name, address, or city..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Properties Table */}
      <div className="bg-surface border border-line rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-sunken border-b border-line text-ink-muted uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-5">Property</th>
                <th className="py-3.5 px-5">Location</th>
                <th className="py-3.5 px-5">Category</th>
                <th className="py-3.5 px-5">Assigned Landlord</th>
                <th className="py-3.5 px-5 text-center">Units</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && properties.length === 0 ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-36" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20 rounded-full" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3.5 px-5 text-center"><Skeleton className="h-4 w-8 mx-auto" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-16 rounded-full" /></td>
                    <td className="py-3.5 px-5 text-right"><Skeleton className="h-7 w-16 ml-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : properties.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-ink-muted">
                    No properties found matching criteria.
                  </td>
                </tr>
              ) : (
                properties.map((property) => (
                  <tr key={property._id} className="hover:bg-surface-hover transition">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold font-grotesk">
                          {property.name.charAt(0)}
                        </div>
                        <div>
                          <strong className="text-ink-strong font-grotesk font-semibold block text-sm">
                            {property.name}
                          </strong>
                          <span className="text-[10px] text-ink-muted">ID: {property._id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-ink-soft">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                        <span>{property.address}, {property.city}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="badge badge-info">
                        {property.category || 'Residential'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      {property.landlord ? (
                        <div className="flex items-center gap-1.5 text-ink-soft">
                          <User className="w-3.5 h-3.5 text-ink-muted" />
                          <span>
                            {property.landlord.firstName} {property.landlord.lastName}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="px-2 py-0.5 rounded bg-surface-hover text-ink-soft font-bold">
                        {property.unitsCount || 0}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${property.status === 'inactive' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
                        {property.status === 'inactive' ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(property)}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-slate-700 text-indigo-400 transition cursor-pointer"
                          title="Edit Property"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(property)}
                          disabled={changingStatusId === property._id}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-amber-900/40 text-amber-300 transition cursor-pointer disabled:opacity-50"
                          title={property.status === 'inactive' ? 'Reactivate Property' : 'Deactivate Property'}
                        >
                          {property.status === 'inactive' ? <RotateCcw className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(property)}
                          disabled={changingStatusId === property._id}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-red-900/40 text-red-300 transition cursor-pointer disabled:opacity-50"
                          title="Permanently delete property"
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
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span>{editingProperty ? 'Edit Property' : 'Create New Property'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink-strong cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-ink-muted block font-semibold">Property Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Pacific Grand Tower"
                  className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Street Address</label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. 104 Ocean View Blvd"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">City</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="e.g. Santa Monica"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Assign Landlord</label>
                  <select
                    required
                    value={formData.landlord}
                    onChange={(e) => setFormData({ ...formData, landlord: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Select a Landlord</option>
                    {landlords.map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.firstName} {l.lastName} ({l.email})
                      </option>
                    ))}
                  </select>
                </div>
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
                  {submitting ? 'Saving...' : editingProperty ? 'Save Changes' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default PropertiesTab;
