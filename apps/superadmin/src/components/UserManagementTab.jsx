import React, { useState, useEffect } from 'react';
import {
  Users, UserPlus, Search, Filter, Edit2, Power, RotateCcw, Trash2, X, Check,
  AlertCircle, RefreshCw, Mail, Phone, ShieldCheck, User, Building,
  CheckCircle2, Ban, Lock
} from 'lucide-react';
import {
  getUsers, createUser, updateUser, setUserActive, deleteUser, getUsersLookup
} from '../services/superadminApi';
import { Skeleton } from './ui/SkeletonLoader';

export const UserManagementTab = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Dropdown Lookups (for assigning landlord to tenant)
  const [landlordsList, setLandlordsList] = useState([]);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'landlord',
    status: 'active',
    plan: 'starter',
    password: '',
    landlord: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState(null);

  const fetchUsersData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getUsers({
        role: roleFilter,
        status: statusFilter,
        search,
      });
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load platform users');
    } finally {
      setLoading(false);
    }
  };

  const fetchLookups = async () => {
    try {
      const data = await getUsersLookup();
      setLandlordsList(data.landlords || []);
    } catch (err) {
      console.error('Failed to load landlords lookup:', err);
    }
  };

  useEffect(() => {
    fetchUsersData();
  }, [roleFilter, statusFilter, search]);

  useEffect(() => {
    fetchLookups();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'landlord',
      status: 'active',
      plan: 'starter',
      password: '',
      landlord: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setFormData({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role || 'landlord',
      status: u.status || 'active',
      plan: u.plan || 'starter',
      password: '', // Leave blank unless changing
      landlord: u.landlord?._id || u.landlord || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      if (editingUser) {
        const payload = { ...formData };
        if (!payload.password) delete payload.password;
        await updateUser(editingUser._id, payload);
        setSuccessMsg(`User "${formData.firstName} ${formData.lastName}" updated successfully.`);
      } else {
        if (!formData.password) {
          throw new Error('Password is required for new users');
        }
        await createUser(formData);
        setSuccessMsg(`User "${formData.firstName} ${formData.lastName}" created successfully.`);
      }
      setIsModalOpen(false);
      await fetchUsersData();
      await fetchLookups();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    const shouldActivate = user.status !== 'active';
    const action = shouldActivate ? 'reactivate' : 'suspend';
    const name = `${user.firstName} ${user.lastName}`;
    if (!window.confirm(`Are you sure you want to ${action} "${name}"? ${shouldActivate ? 'They will be able to sign in again.' : 'They will lose access immediately; their records will be preserved.'}`)) {
      return;
    }

    setChangingStatusId(user._id);
    try {
      await setUserActive(user._id, shouldActivate);
      setSuccessMsg(`User "${name}" ${shouldActivate ? 'reactivated' : 'suspended'} successfully.`);
      await fetchUsersData();
      await fetchLookups();
    } catch (err) {
      setError(err.message || `Failed to ${action} user`);
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleDelete = async (user) => {
    const name = `${user.firstName} ${user.lastName}`;
    if (!window.confirm(`Permanently delete user "${name}"? This cannot be undone. Accounts linked to properties, units, or lease history are protected.`)) return;
    setChangingStatusId(user._id);
    try {
      await deleteUser(user._id);
      setSuccessMsg(`User "${name}" permanently deleted.`);
      await fetchUsersData();
      await fetchLookups();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setChangingStatusId(null);
    }
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'superadmin':
        return <span className="badge badge-info">Superadmin</span>;
      case 'landlord':
        return <span className="badge badge-info">Landlord</span>;
      case 'tenant':
        return <span className="badge badge-success">Tenant</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-surface-hover text-ink-soft">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-line rounded-3xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Users className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold font-grotesk text-ink-strong">Platform Users Registry</h2>
          </div>
          <p className="text-xs text-ink-muted font-sans">
            Direct database CRUD for Landlords, Tenants, and Superadmins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchUsersData}
            className="p-2.5 rounded-xl bg-surface hover:bg-surface-hover text-ink-soft border border-line transition btn-press cursor-pointer"
            title="Refresh Users"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreateModal}
            className="btn btn-primary font-grotesk text-xs flex items-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
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
            placeholder="Search users by name, email, or phone number..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Roles</option>
            <option value="landlord">Landlords</option>
            <option value="tenant">Tenants</option>
            <option value="superadmin">Superadmins</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-sunken border border-line text-xs text-ink-soft focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Deactivated</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface border border-line rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-sunken border-b border-line text-ink-muted uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3.5 px-5">User</th>
                <th className="py-3.5 px-5">Role</th>
                <th className="py-3.5 px-5">Contact Details</th>
                <th className="py-3.5 px-5">Parent Landlord</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && users.length === 0 ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <div className="space-y-1.5 flex-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-20 rounded-full" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-36" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-28" /></td>
                    <td className="py-3.5 px-5"><Skeleton className="h-4 w-16 rounded-full" /></td>
                    <td className="py-3.5 px-5 text-right"><Skeleton className="h-7 w-16 ml-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-ink-muted">
                    No users found matching query.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id} className="hover:bg-surface-hover transition">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold font-grotesk text-xs">
                          {u.firstName.charAt(0)}{u.lastName.charAt(0)}
                        </div>
                        <div>
                          <strong className="text-ink-strong font-grotesk font-semibold block text-sm">
                            {u.firstName} {u.lastName}
                          </strong>
                          <span className="text-[10px] text-ink-muted">ID: {u._id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      {getRoleBadge(u.role)}
                    </td>
                    <td className="py-3.5 px-5 text-ink-soft">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-ink-muted shrink-0" />
                          <span>{u.email}</span>
                        </div>
                        {u.phone && (
                          <div className="flex items-center gap-1.5 text-ink-muted text-[11px]">
                            <Phone className="w-3 h-3 text-ink-muted shrink-0" />
                            <span>{u.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-ink-muted">
                      {u.landlord ? (
                        <span className="text-ink-soft font-medium">
                          {u.landlord.firstName} {u.landlord.lastName}
                        </span>
                      ) : (
                        <span className="text-ink-muted italic">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      {u.status === 'active' ? (
                        <span className="badge badge-success inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      ) : (
                        <span className="badge badge-warning inline-flex items-center gap-1">
                          Deactivated
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-slate-700 text-indigo-400 transition cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={changingStatusId === u._id}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-amber-900/40 text-amber-300 transition cursor-pointer disabled:opacity-50"
                          title={u.status === 'active' ? 'Suspend User' : 'Reactivate User'}
                        >
                          {u.status === 'active' ? <Power className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={changingStatusId === u._id || u.role === 'superadmin'}
                          className="p-1.5 rounded-lg bg-surface-hover hover:bg-red-900/40 text-red-300 transition cursor-pointer disabled:opacity-50"
                          title={u.role === 'superadmin' ? 'Superadmin accounts cannot be deleted here' : 'Permanently delete user'}
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
                <User className="w-4 h-4 text-indigo-400" />
                <span>{editingUser ? 'Edit Platform User' : 'Create New User'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink-strong cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">First Name</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Last Name</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1 555-0199"
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="landlord">Landlord</option>
                    <option value="tenant">Tenant</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </div>

              </div>

              {formData.role === 'tenant' && (
                <div className="space-y-1">
                  <label className="text-ink-muted block font-semibold">Assign Landlord (for Tenant)</label>
                  <select
                    value={formData.landlord}
                    onChange={(e) => setFormData({ ...formData, landlord: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">No Landlord Assigned</option>
                    {landlordsList.map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.firstName} {l.lastName} ({l.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-ink-muted block font-semibold">
                  {editingUser ? 'New Password (leave blank to keep current)' : 'Password'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? '••••••••' : 'Min. 8 chars, 1 number'}
                  className="w-full px-3 py-2 rounded-xl bg-surface-sunken border border-line text-ink-strong  focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
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
                  {submitting ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default UserManagementTab;
