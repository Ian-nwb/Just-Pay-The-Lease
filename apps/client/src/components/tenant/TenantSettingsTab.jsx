import React, { useState, useEffect } from 'react';
import { TwoFactorSettings } from '../common/TwoFactorSettings';
import { 
  User, Bell, Shield, Car, CheckCircle2, Plus, Trash2,
  Lock, Camera, Building2, Wrench, CreditCard,
  Eye, EyeOff, Check, Loader2
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { tenantApi, authApi } from '../../services/api';
import { onlyPhoneDigits, handleNumericKeyDown } from '../../utils/numberSanitizers';

const INITIAL_VEHICLES = [];

export const TenantSettingsTab = ({
  tenant,
  unit,
  property,
  landlord,
  lease,
}) => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState('profile');
  const [saved, setSaved] = useState(false);

  // 1. Profile & Account state
  const [firstName, setFirstName] = useState(tenant?.firstName || user?.firstName || '');
  const [middleName, setMiddleName] = useState(tenant?.middleName || user?.middleName || '');
  const [lastName, setLastName] = useState(tenant?.lastName || user?.lastName || '');
  const [email, setEmail] = useState(tenant?.email || user?.email || '');
  const [phone, setPhone] = useState(tenant?.phone || user?.phone || '');
  const [emergencyContact, setEmergencyContact] = useState(() => ({
    name: user?.emergencyContact?.name || '',
    relationship: user?.emergencyContact?.relationship || '',
    phone: user?.emergencyContact?.phone || '',
  }));
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: '', success: '' });
  const [visiblePasswordFields, setVisiblePasswordFields] = useState({});

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  // 2. Notifications state
  const [notifChannels, setNotifChannels] = useState(user?.preferences?.notifications || {
    maintenance: { push: true, email: true },
    payments: { push: true, email: true },
    lease: { push: true, email: true },
    announcements: { push: true, email: true },
  });

  const [emailDigest, setEmailDigest] = useState(user?.preferences?.emailDigest?.enabled === true);
  const [quietHours, setQuietHours] = useState(() => ({
    enabled: user?.preferences?.quietHours?.enabled === true,
    start: user?.preferences?.quietHours?.start || '22:00',
    end: user?.preferences?.quietHours?.end || '07:00',
  }));

  // 3. Maintenance Requests preferences state
  const [accessInstructions, setAccessInstructions] = useState(user?.preferences?.maintenance?.accessPreference || 'must_be_present');
  const [customAccessNote, setCustomAccessNote] = useState(user?.preferences?.maintenance?.accessNote || '');

  // Vehicles state
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [newMake, setNewMake] = useState('');
  const [newPlate, setNewPlate] = useState('');
  const [isAddingVeh, setIsAddingVeh] = useState(false);

  // 6. Privacy state
  const [privacySettings, setPrivacySettings] = useState(user?.preferences?.privacy || {
    showPhoneToLandlord: true,
    showEmergencyContactToLandlord: true,
    showVehiclesToLandlord: true,
    vendorDataSharing: true, // share phone with dispatched technicians
    anonymousAnnouncements: false,
  });

  useEffect(() => {
    tenantApi.getVehicles().then((res) => {
      const vList = res?.data || res?.vehicles || (Array.isArray(res) ? res : []);
      if (Array.isArray(vList)) setVehicles(vList);
    }).catch(() => {});
  }, [user]);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    try {
      await authApi.updateProfile({
        name: [firstName, middleName, lastName].filter(Boolean).join(' '),
        phone,
        emergencyContact,
          preferences: {
            notifications: notifChannels,
            emailDigest: { enabled: emailDigest },
            quietHours,
            privacy: privacySettings,
            maintenance: {
              accessPreference: accessInstructions,
              accessNote: accessInstructions === 'custom' ? customAccessNote.trim() : '',
            },
        },
      });
      updateUser({
        firstName,
        lastName,
        name: [firstName, middleName, lastName].filter(Boolean).join(' '),
        phone,
        emergencyContact,
        preferences: {
          notifications: notifChannels,
          emailDigest: { enabled: emailDigest },
          quietHours,
          privacy: privacySettings,
          maintenance: {
            accessPreference: accessInstructions,
            accessNote: accessInstructions === 'custom' ? customAccessNote.trim() : '',
          },
        },
      });
      toast.success('Settings Saved', 'Your profile information has been successfully updated.');
    } catch (err) {
      toast.error('Settings not saved', err.message || 'Could not save your settings. Try again.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleUpdatePassword = async (e) => {
    if (e) e.preventDefault();
    if (!passwordForm.current || !passwordForm.newPass) {
      setPasswordStatus({ loading: false, error: 'Current and new password are required', success: '' });
      toast.error('Validation Error', 'Current and new password are required.');
      return;
    }
    if (passwordForm.newPass.length < 8) {
      setPasswordStatus({ loading: false, error: 'New password must be at least 8 characters', success: '' });
      toast.error('Validation Error', 'New password must be at least 8 characters long.');
      return;
    }
    setPasswordStatus({ loading: true, error: '', success: '' });
    try {
      await authApi.changePassword({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.newPass,
      });
      setPasswordStatus({ loading: false, error: '', success: 'Password updated successfully!' });
      setPasswordForm({ current: '', newPass: '', confirm: '' });
      toast.success('Password Changed', 'Your security password has been updated.');
      setTimeout(() => setPasswordStatus((s) => ({ ...s, success: '' })), 4000);
    } catch (err) {
      setPasswordStatus({ loading: false, error: err.message || 'Failed to update password', success: '' });
      toast.error('Update Failed', err.message || 'Failed to update password.');
    }
  };

  const handleToggleChannel = (category, channel) => {
    setNotifChannels((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [channel]: !prev[category][channel],
      },
    }));
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newMake.trim() || !newPlate.trim()) return;
    try {
      const res = await tenantApi.addVehicle({
        model: newMake.trim(),
        plate: newPlate.trim(),
        color: 'Standard',
      });
      const created = res.data || res.vehicle || res;
      setVehicles((prev) => [...prev, created]);
      setNewMake('');
      setNewPlate('');
      setIsAddingVeh(false);
    } catch (err) {
      toast.error('Vehicle not saved', err.message || 'Could not save the vehicle. Please try again.');
    }
  };

  const handleRemoveVehicle = async (id) => {
    try {
      await tenantApi.deleteVehicle(id);
      setVehicles((prev) => prev.filter((v) => v.id !== id && v._id !== id));
    } catch (err) {
      toast.error('Vehicle not removed', err.message || 'Could not remove the vehicle. Please try again.');
    }
  };

  const subTabs = [
    { key: 'profile', label: 'Profile & Account', icon: User },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'maintenance', label: 'Maintenance Requests', icon: Wrench },
    { key: 'payments', label: 'Payments', icon: CreditCard },
    { key: 'privacy', label: 'Privacy & Permissions', icon: Shield },
  ];

  return (
    <div className="space-y-6">
      
      {/* ─── HEADER ─── */}
      <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-medium">
            <User className="w-3.5 h-3.5" />
            <span>Resident Settings & Controls</span>
          </div>
          <h1 className="text-2xl font-extrabold font-grotesk text-slate-900 dark:text-white mt-1">
            Tenant Preferences & Portal Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
            Manage your profile, notification preferences, maintenance entry requests, and privacy choices.
          </p>
        </div>

        {/* Global Save Button */}
        <div className="flex items-center gap-3 shrink-0">
          {saved && (
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> Preferences saved!
            </span>
          )}
          <button
            onClick={handleSave}
            className="btn btn-primary font-grotesk text-xs flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Save All Preferences
          </button>
        </div>
      </div>

      {/* ─── SUB-NAV TABS ─── */}
      <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-200/60 dark:bg-surface border border-slate-300/60 dark:border-slate-800 overflow-x-auto scrollbar-none">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-grotesk font-semibold whitespace-nowrap btn-press transition-all
                ${isActive 
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200 dark:border-slate-800' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }
              `}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-500' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: PROFILE & ACCOUNT ─── */}
      {activeSubTab === 'profile' && (
        <div className="space-y-6">
          
          {/* Avatar & Assigned Unit Banner */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Photo & Avatar Controls */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 text-center space-y-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-3xl font-extrabold font-grotesk shadow-xl overflow-hidden relative">
                  {avatarLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  ) : avatarUrl ? (
                    <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || 'IS'
                  )}
                </div>
                <label className="absolute bottom-0 right-0 p-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg cursor-pointer btn-press disabled:opacity-50">
                  <Camera className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    disabled={avatarLoading}
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 4 * 1024 * 1024) {
                        setAvatarError('Photo size exceeds 4MB limit. Please upload an image under 4MB.');
                        return;
                      }
                      setAvatarError('');
                      setAvatarLoading(true);
                      try {
                        const res = await authApi.uploadAvatar(file);
                        const newUrl = res.avatarUrl || res.data?.avatarUrl;
                        setAvatarUrl(newUrl);
                        updateUser({ ...(user || {}), avatarUrl: newUrl });
                      } catch (err) {
                        setAvatarError(err.message || 'Failed to upload photo to Cloudinary');
                      } finally {
                        setAvatarLoading(false);
                      }
                    }}
                  />
                </label>
              </div>

              <div>
                <h3 className="text-sm font-bold font-grotesk text-slate-900 dark:text-white">{fullName}</h3>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Resident Account</span>
              </div>

              {avatarError && (
                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs max-w-[220px]">
                  {avatarError}
                </div>
              )}

              {avatarUrl && (
                <button
                  type="button"
                  disabled={avatarLoading}
                  onClick={async () => {
                    setAvatarLoading(true);
                    setAvatarError('');
                    try {
                      await authApi.removeAvatar();
                      setAvatarUrl(null);
                      updateUser({ ...(user || {}), avatarUrl: '' });
                    } catch (err) {
                      setAvatarError(err.message || 'Failed to remove photo');
                    } finally {
                      setAvatarLoading(false);
                    }
                  }}
                  className="text-xs font-mono text-rose-500 hover:underline disabled:opacity-50"
                >
                  Remove custom photo
                </button>
              )}
            </div>

            {/* Assigned Property & Unit Summary */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-500" /> Assigned Property & Unit
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                  unit 
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400' 
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  {unit ? 'Active Occupant' : 'Pending Assignment'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block">Property</span>
                  <strong className="text-slate-900 dark:text-white font-grotesk text-sm block truncate">
                    {property?.name || unit?.propertyName || (unit ? 'Assigned Property' : 'None Assigned')}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800">
                  <span className="text-xs text-slate-400 block">Assigned Unit</span>
                  <strong className="text-indigo-600 dark:text-indigo-400 font-grotesk text-sm block">
                    {unit?.label || 'Unassigned'}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-xs text-slate-400 block">Lease Expiry</span>
                  <strong className="text-slate-900 dark:text-white font-grotesk text-sm block">
                    {(lease?.leaseType || unit?.leaseType) === 'indefinite' || (!(lease?.leaseEnd || unit?.leaseEnd) && Boolean(lease?.leaseStart || unit?.leaseStart))
                      ? 'No fixed expiration'
                      : lease?.leaseEnd || unit?.leaseEnd
                      ? new Date(lease?.leaseEnd || unit?.leaseEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'No Active Lease'}
                  </strong>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/15 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-mono">
                <span className="text-slate-600 dark:text-slate-400">
                  Assigned Landlord/Manager: <strong className="text-slate-900 dark:text-white">{landlord?.name || property?.landlordName || 'Management Office'}</strong>
                </span>
                <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                  {landlord?.email || property?.landlordEmail || 'contact@jptl.com'}
                </span>
              </div>
            </div>

          </div>

          {/* Personal Info Form */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" /> Personal Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Middle Name <span className="text-slate-500 font-normal">(Opt)</span></label>
                <input
                  type="text"
                  value={middleName}
                  onChange={(e) => setMiddleName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Contact Phone Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onKeyDown={(e) => handleNumericKeyDown(e, false)}
                  onChange={(e) => setPhone(onlyPhoneDigits(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4 text-xs">
            <div>
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white">Emergency contact</h2>
              <p className="text-slate-500 dark:text-slate-400">Your landlord can see this only while "Share emergency contact" is on in Privacy. Leave all fields empty to remove it.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">Full name
                <input type="text" maxLength={120} value={emergencyContact.name} onChange={(e) => setEmergencyContact((c) => ({ ...c, name: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block font-semibold text-slate-700 dark:text-slate-300">Relationship
                <input type="text" maxLength={60} placeholder="e.g. Sister" value={emergencyContact.relationship} onChange={(e) => setEmergencyContact((c) => ({ ...c, relationship: e.target.value }))} className="mt-1 w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="block font-semibold text-slate-700 dark:text-slate-300">Phone
                <input type="tel" maxLength={30} value={emergencyContact.phone} onChange={(e) => setEmergencyContact((c) => ({ ...c, phone: e.target.value }))} className="mt-1 font-mono w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
            </div>
          </div>

          {/* Registered Vehicles Manager */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                  <Car className="w-4 h-4 text-indigo-500" /> Registered Vehicles & Parking Permits
                </h2>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                  {vehicles.length === 0 ? 'No vehicle on file' : `${vehicles.length} vehicle${vehicles.length > 1 ? 's' : ''} registered`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingVeh(true)}
                className="text-xs font-bold font-grotesk text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 btn-press"
              >
                <Plus className="w-3.5 h-3.5" /> Register Vehicle
              </button>
            </div>

            {vehicles.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-dashed border-slate-200 dark:border-slate-800/80 text-center space-y-1">
                <Car className="w-6 h-6 text-slate-400 mx-auto opacity-50" />
                <p className="text-xs font-mono text-slate-400">No vehicles registered yet.</p>
                <p className="text-xs text-slate-500">Click &ldquo;+ Register Vehicle&rdquo; above if you have a car or motor vehicle.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {vehicles.map((v) => (
                  <div
                    key={v.id || v._id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="space-y-0.5">
                      <strong className="text-slate-900 dark:text-white block font-grotesk text-sm">{v.make} ({v.color || 'Standard'})</strong>
                      <span className="text-slate-500">Plate: <strong className="text-indigo-500">{v.plate}</strong> &bull; Decal: {v.decal || 'Pending'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveVehicle(v.id || v._id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 btn-press"
                      title="Remove Vehicle"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isAddingVeh && (
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-3 text-xs">
                <span className="font-bold text-slate-900 dark:text-white font-grotesk block">Add Vehicle Details</span>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Make & Model (e.g. Honda Civic)"
                    value={newMake}
                    onChange={(e) => setNewMake(e.target.value)}
                    className="bg-white dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                  <input
                    type="text"
                    placeholder="License Plate #"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value)}
                    className="bg-white dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingVeh(false)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 text-slate-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddVehicle}
                    className="btn btn-primary font-grotesk"
                  >
                    Save Vehicle
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Password & Security Preferences */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" /> Password
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                         <div className="space-y-3 p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800">
                <h3 className="font-grotesk font-bold text-slate-900 dark:text-white">Change Account Password</h3>
                <div>
                  <label className="block text-slate-500 mb-1">Current Password</label>
                  <div className="relative">
                    <input
                      type={visiblePasswordFields.current ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                      className="w-full bg-white dark:bg-surface border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 pr-10 text-slate-900 dark:text-white font-mono"
                    />
                    <button type="button" aria-label={visiblePasswordFields.current ? 'Hide current password' : 'Show current password'} onClick={() => setVisiblePasswordFields((p) => ({ ...p, current: !p.current }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-indigo-500">
                      {visiblePasswordFields.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={visiblePasswordFields.newPass ? 'text' : 'password'}
                      placeholder="Minimum 8 characters"
                      value={passwordForm.newPass}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))}
                      className="w-full bg-white dark:bg-surface border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 pr-10 text-slate-900 dark:text-white font-mono"
                    />
                    <button type="button" aria-label={visiblePasswordFields.newPass ? 'Hide new password' : 'Show new password'} onClick={() => setVisiblePasswordFields((p) => ({ ...p, newPass: !p.newPass }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-indigo-500">
                      {visiblePasswordFields.newPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Confirm New Password</label>
                  <div className="relative">
                    <input
                    type={visiblePasswordFields.confirm ? 'text' : 'password'}
                    placeholder="Re-enter new password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                    className={`w-full bg-white dark:bg-surface border rounded-xl px-3 py-2 pr-10 text-slate-900 dark:text-white font-mono ${
                      passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-slate-300 dark:border-slate-800'
                    }`}
                    />
                    <button type="button" aria-label={visiblePasswordFields.confirm ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setVisiblePasswordFields((p) => ({ ...p, confirm: !p.confirm }))} className="absolute right-3 top-2.5 text-slate-400 hover:text-indigo-500">
                      {visiblePasswordFields.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm && (
                    <p className="text-rose-500 text-xs mt-1 font-mono">Passwords do not match</p>
                  )}
                </div>
                {passwordStatus.error && (
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                    {passwordStatus.error}
                  </div>
                )}
                {passwordStatus.success && (
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                    {passwordStatus.success}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleUpdatePassword}
                  disabled={passwordStatus.loading || (!!passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm)}
                  className="btn btn-brand font-grotesk flex items-center justify-center gap-2"
                >
                  {passwordStatus.loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>

            </div>
          </div>

          <TwoFactorSettings />

        </div>
      )}

      {/* ─── TAB 2: NOTIFICATIONS ─── */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-6">
          
          {/* Channel Matrix Card */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div>
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" /> Multi-Channel Notification Matrix
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose push alerts and which categories appear in your daily email summary. In-app notifications are always kept.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="py-3 px-4 font-normal">Notification Type</th>
                    <th className="py-3 px-4 text-center font-normal">Push Notification</th>
                    <th className="py-3 px-4 text-center font-normal">Daily Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                  
                  {/* Maintenance */}
                  <tr>
                    <td className="py-4 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Maintenance Request Updates
                      <span className="block text-xs font-mono text-slate-500 font-normal">Technician assigned, arrival times, ticket status changes</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.maintenance.push}
                        onChange={() => handleToggleChannel('maintenance', 'push')}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.maintenance.email}
                        onChange={() => handleToggleChannel('maintenance', 'email')}
                        disabled={!emailDigest}
                        aria-label="Include maintenance in daily email"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  </tr>

                  {/* Payments */}
                  <tr>
                    <td className="py-4 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Payment & Billing Reminders
                      <span className="block text-xs font-mono text-slate-500 font-normal">Upcoming rent due dates, payment receipts, auto-pay notices</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.payments.push}
                        onChange={() => handleToggleChannel('payments', 'push')}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.payments.email}
                        onChange={() => handleToggleChannel('payments', 'email')}
                        disabled={!emailDigest}
                        aria-label="Include payments in daily email"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  </tr>

                  {/* Lease Renewals */}
                  <tr>
                    <td className="py-4 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Lease Renewal Alerts
                      <span className="block text-xs font-mono text-slate-500 font-normal">90-day renewal windows, rate updates, contract signatures</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.lease.push}
                        onChange={() => handleToggleChannel('lease', 'push')}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.lease.email}
                        onChange={() => handleToggleChannel('lease', 'email')}
                        disabled={!emailDigest}
                        aria-label="Include lease in daily email"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  </tr>

                  {/* Landlord Announcements */}
                  <tr>
                    <td className="py-4 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Landlord Announcements
                      <span className="block text-xs font-mono text-slate-500 font-normal">Building maintenance notices, amenity updates, community rules</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.announcements.push}
                        onChange={() => handleToggleChannel('announcements', 'push')}
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={notifChannels.announcements.email}
                        onChange={() => handleToggleChannel('announcements', 'email')}
                        disabled={!emailDigest}
                        aria-label="Include announcements in daily email"
                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4 text-xs">
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span>
                <strong className="block font-grotesk text-sm text-slate-900 dark:text-white">Daily email summary</strong>
                <span className="text-slate-500">One email each morning with the last day's updates from the categories ticked above.</span>
              </span>
              <input type="checkbox" checked={emailDigest} onChange={(e) => setEmailDigest(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 cursor-pointer shrink-0" />
            </label>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span>
                  <strong className="block font-grotesk text-sm text-slate-900 dark:text-white">Quiet hours</strong>
                  <span className="text-slate-500">Push alerts are held during these hours and sent when they end. In-app notifications still arrive right away.</span>
                </span>
                <input type="checkbox" checked={quietHours.enabled} onChange={(e) => setQuietHours((q) => ({ ...q, enabled: e.target.checked }))} className="w-4 h-4 rounded text-indigo-600 cursor-pointer shrink-0" />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">From
                  <input type="time" value={quietHours.start} disabled={!quietHours.enabled} onChange={(e) => setQuietHours((q) => ({ ...q, start: e.target.value }))} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-2 py-1 disabled:opacity-50" />
                </label>
                <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">To
                  <input type="time" value={quietHours.end} disabled={!quietHours.enabled} onChange={(e) => setQuietHours((q) => ({ ...q, end: e.target.value }))} className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-2 py-1 disabled:opacity-50" />
                </label>
              </div>
            </div>
          </div>

        </div>
      )}

      {activeSubTab === 'maintenance' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Maintenance entry preference</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">This is a request for the landlord or assigned technician. It does not grant entry by itself; the visit must still be arranged and confirmed.</p>
          </div>
          <div className="space-y-3 text-sm">
            {[
              { value: 'must_be_present', label: 'I want to be present for entry' },
              { value: 'ok_if_not_home', label: 'I can be away if the visit is confirmed with me' },
              { value: 'custom', label: 'I have a note for the visit' },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 cursor-pointer">
                <input type="radio" name="accessInstructions" checked={accessInstructions === option.value} onChange={() => setAccessInstructions(option.value)} />
                <span className="text-slate-800 dark:text-slate-100">{option.label}</span>
              </label>
            ))}
          </div>
          {accessInstructions === 'custom' && (
            <label className="block text-sm text-slate-700 dark:text-slate-300">
              Visit note
              <textarea rows={3} maxLength={500} value={customAccessNote} onChange={(event) => setCustomAccessNote(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface p-3 text-slate-900 dark:text-white" placeholder="Share a timing or pet-safety note" />
              <span className="mt-1 block text-xs text-slate-500">{customAccessNote.length}/500 characters</span>
            </label>
          )}
        </div>
      )}

      {activeSubTab === 'payments' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-6 space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Rent payment options</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Open an invoice from Rent &amp; Payments, then upload your transfer receipt or choose Pay Onsite. The landlord confirms each submission. Saved cards, auto-pay, and email reminders are not available.</p>
        </div>
      )}

      {/* ─── TAB 5: PRIVACY & PERMISSIONS ─── */}
      {activeSubTab === 'privacy' && (
        <div className="space-y-6">
          
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div>
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-500" /> Privacy & Landlord Data Visibility
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control what personal details are shared with your landlord and dispatched vendor personnel.
              </p>
            </div>

            <div className="space-y-3 text-xs font-sans">
              
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 dark:text-white block font-grotesk">Phone Number Visible to Landlord</strong>
                  <span className="text-slate-500 text-xs">Allow your landlord to view your direct mobile phone in the tenant directory.</span>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.showPhoneToLandlord}
                  onChange={(e) => setPrivacySettings((p) => ({ ...p, showPhoneToLandlord: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 dark:text-white block font-grotesk">Third-Party Vendor Contact Sharing Consent</strong>
                  <span className="text-slate-500 text-xs">Allow sharing your contact number with assigned external vendors (plumbing, electrician) during active maintenance jobs.</span>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.vendorDataSharing}
                  onChange={(e) => setPrivacySettings((p) => ({ ...p, vendorDataSharing: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 dark:text-white block font-grotesk">Vehicle Registration Details Sharing</strong>
                  <span className="text-slate-500 text-xs">Share vehicle license plate with security desk & parking enforcement staff.</span>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.showVehiclesToLandlord}
                  onChange={(e) => setPrivacySettings((p) => ({ ...p, showVehiclesToLandlord: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 dark:text-white block font-grotesk">Share emergency contact</strong>
                  <span className="text-slate-500 text-xs">Let your landlord see the emergency contact saved in your profile.</span>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.showEmergencyContactToLandlord !== false}
                  onChange={(e) => setPrivacySettings((p) => ({ ...p, showEmergencyContactToLandlord: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

            </div>

          </div>

        </div>
      )}


    </div>
  );
};
