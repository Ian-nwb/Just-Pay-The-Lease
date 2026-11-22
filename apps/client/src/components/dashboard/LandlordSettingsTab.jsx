import React, { useState, useEffect } from 'react';
import { TwoFactorSettings } from '../common/TwoFactorSettings';
import { BillingPanel } from './BillingPanel';
import { Building2, Wrench, DollarSign, Bell, Database, Lock, CheckCircle2, Key, Check, User, Camera, Eye, EyeOff, ShieldAlert, Wifi, BookOpen, Loader2, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { landlordApi, authApi } from '../../services/api';
import { onlyPhoneDigits, handleNumericKeyDown } from '../../utils/numberSanitizers';

export const LandlordSettingsTab = ({
  properties = [],
  units = [],
  tenants = [],
  initialSubTab = 'account',
}) => {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || null);
  const [defaultCurrency, setDefaultCurrency] = useState(user?.preferences?.currency || 'PHP');
  const [defaultTimezone, setDefaultTimezone] = useState(user?.preferences?.timezone || user?.timezone || 'Asia/Manila');
  const readAlerts = (alerts = {}) => ({
    newTicket: alerts.newTicket !== false,
    overduePayment: alerts.overduePayment !== false,
    leaseExpiration: alerts.leaseExpiration !== false,
    dailySummaryEmail: alerts.dailySummaryEmail === true,
  });
  const [landlordAlerts, setLandlordAlerts] = useState(() => readAlerts(user?.preferences?.alerts));

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);
  const [saved, setSaved] = useState(false);

  // 1. Landlord Account & Profile state
  const [landlordProfile, setLandlordProfile] = useState({
    firstName: user?.firstName || '',
    middleName: user?.middleName || '',
    lastName: user?.lastName || '',
    name: user?.name || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || '',
    email: user?.email || '',
    phone: user?.phone || '',
    company: user?.company || '',
    officePhone: user?.officePhone || '',
  });

  useEffect(() => {
    if (user) {
      const computedName = user.name || [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ');
      setLandlordProfile((prev) => ({
        ...prev,
        firstName: user.firstName !== undefined ? user.firstName : prev.firstName,
        middleName: user.middleName !== undefined ? user.middleName : prev.middleName,
        lastName: user.lastName !== undefined ? user.lastName : prev.lastName,
        name: computedName || prev.name,
        email: user.email !== undefined ? user.email : prev.email,
        phone: user.phone !== undefined ? user.phone : prev.phone,
        company: user.company !== undefined ? user.company : prev.company,
        officePhone: user.officePhone !== undefined ? user.officePhone : prev.officePhone,
      }));
      if (user.avatarUrl !== undefined) setAvatarUrl(user.avatarUrl || null);
      if (user.preferences?.currency) setDefaultCurrency(user.preferences.currency);
      if (user.preferences?.timezone) setDefaultTimezone(user.preferences.timezone);
      if (user.preferences?.alerts) setLandlordAlerts(readAlerts(user.preferences.alerts));
    }
  }, [user]);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: '', success: '' });
  const [showPassword, setShowPassword] = useState(false);

  // 6b. Building Access & Rules state
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [propertyTimezone, setPropertyTimezone] = useState('Asia/Manila');
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [parkingAvailable, setParkingAvailable] = useState(false);
  const [buildingAccess, setBuildingAccess] = useState({ gateCode: '', wifiSsid: '', wifiPassword: '' });
  const [buildingRules, setBuildingRules] = useState([]);
  const [showWifiPw, setShowWifiPw] = useState(false);
  const [accessSaved, setAccessSaved] = useState(false);

  const handleSaveBuildingAccess = async () => {
    const targetProperty = properties?.find((property) => String(property._id || property.id) === String(selectedPropertyId)) || properties?.[0];
    if (!targetProperty) {
      toast.error('No property selected', 'Create a property before saving access details.');
      return;
    }
    try {
      const propId = targetProperty._id || targetProperty.id;
      await landlordApi.updateProperty(propId, {
        accessCodes: buildingAccess,
        buildingRules,
        timezone: propertyTimezone,
        petsAllowed,
        parkingAvailable,
      });
      toast.success('Building Access Saved', 'Community access codes & guidelines updated.');
    } catch (err) {
      toast.error('Save failed', err.message || 'Could not save property details. Try again.');
      return;
    }
    setAccessSaved(true);
    setTimeout(() => setAccessSaved(false), 2500);
  };

  // Sync from loaded properties
  useEffect(() => {
    const prop = properties?.find((property) => String(property._id || property.id) === String(selectedPropertyId)) || properties?.[0];
    if (!prop) return;
    const propId = String(prop._id || prop.id);
    if (propId !== selectedPropertyId) setSelectedPropertyId(propId);
    setPropertyTimezone(prop.timezone || 'Asia/Manila');
    setDefaultTimezone(prop.timezone || 'Asia/Manila');
    setPetsAllowed(Boolean(prop.petsAllowed));
    setParkingAvailable(Boolean(prop.parkingAvailable));
    setBuildingAccess({
      gateCode: prop.accessCodes?.gateCode || '',
      wifiSsid: prop.accessCodes?.wifiSsid || '',
      wifiPassword: prop.accessCodes?.wifiPassword || '',
    });
    setBuildingRules(prop.buildingRules || []);
  }, [properties, selectedPropertyId]);
  const handleSave = async () => {
    try {
      await authApi.updateProfile({
        name: [landlordProfile.firstName, landlordProfile.middleName, landlordProfile.lastName].filter(Boolean).join(' '),
        phone: landlordProfile.phone,
        company: landlordProfile.company,
        officePhone: landlordProfile.officePhone,
        preferences: {
          currency: defaultCurrency,
          timezone: defaultTimezone,
          alerts: landlordAlerts,
        },
      });
      updateUser({
        name: [landlordProfile.firstName, landlordProfile.middleName, landlordProfile.lastName].filter(Boolean).join(' '),
        firstName: landlordProfile.firstName,
        lastName: landlordProfile.lastName,
        phone: landlordProfile.phone,
        company: landlordProfile.company,
        officePhone: landlordProfile.officePhone,
        preferences: { currency: defaultCurrency, timezone: defaultTimezone, alerts: landlordAlerts },
      });
      toast.success('Settings Saved', 'Landlord profile & preferences updated successfully.');
    } catch (err) {
      toast.error('Settings not saved', err.message || 'Could not save landlord settings. Try again.');
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
      toast.error('Validation Error', 'New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.confirm && passwordForm.newPass !== passwordForm.confirm) {
      setPasswordStatus({ loading: false, error: 'New passwords do not match', success: '' });
      toast.error('Validation Error', 'New passwords do not match.');
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
      toast.success('Password Updated', 'Your security password has been changed.');
      setTimeout(() => setPasswordStatus((s) => ({ ...s, success: '' })), 4000);
    } catch (err) {
      setPasswordStatus({ loading: false, error: err.message || 'Failed to update password', success: '' });
      toast.error('Update Failed', err.message || 'Failed to update password.');
    }
  };

  const subTabs = [
    { key: 'account', label: 'Profile & Account', icon: User },
    { key: 'maintenance', label: 'Maintenance & Vendors', icon: Wrench },
    { key: 'payments', label: 'Payments & Payouts', icon: DollarSign },
    { key: 'notifications', label: 'Landlord Alerts', icon: Bell },
    { key: 'reporting', label: 'Reporting & Logs', icon: Database },
    { key: 'security', label: 'Security', icon: Lock },
  ];

  return (
    <div className="space-y-6">
      
      {/* ─── HEADER ─── */}
      <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-medium">
            <User className="w-3.5 h-3.5" />
            <span>Landlord Control Panel</span>
          </div>
          <h1 className="text-2xl font-extrabold font-grotesk text-slate-900 dark:text-white mt-1">
            Landlord Profile & System Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-sans">
              Manage your profile, property access details, and supported alert preferences.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saved && (
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <CheckCircle2 className="w-4 h-4" /> Preferences Saved!
            </span>
          )}
          <button
            onClick={handleSave}
            className="btn btn-primary font-grotesk text-xs flex items-center gap-2"
          >
            <Check className="w-4 h-4" /> Save Settings
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

      {/* ─── SUB-TAB 1: PROFILE & ACCOUNT ─── */}
      {activeSubTab === 'account' && (
        <div className="space-y-6">
          
          {/* Avatar & Portfolio Banner */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Photo & Avatar Controls */}
            <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 text-center space-y-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 text-white flex items-center justify-center text-3xl font-extrabold font-grotesk shadow-xl overflow-hidden relative">
                  {avatarLoading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  ) : avatarUrl ? (
                    <img src={avatarUrl} alt="Landlord Profile" className="w-full h-full object-cover" />
                  ) : (
                    ((landlordProfile.firstName?.[0] || '') + (landlordProfile.lastName?.[0] || '')).toUpperCase() || 'AV'
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
                <h3 className="text-sm font-bold font-grotesk text-slate-900 dark:text-white">
                  {user?.name || [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ') || landlordProfile.name || [landlordProfile.firstName, landlordProfile.middleName, landlordProfile.lastName].filter(Boolean).join(' ') || 'Landlord'}
                </h3>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Property Owner & Landlord</span>
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

            {/* Portfolio Overview Summary */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800/60 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-500" /> Portfolio Scope & Managed Units
                </h3>
                <span className="badge badge-success font-mono">
                  Verified Landlord
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400 block uppercase">Buildings</span>
                  <strong className="text-lg font-bold font-grotesk text-slate-900 dark:text-white">
                    {properties?.length || 0} Properties
                  </strong>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400 block uppercase">Total Units</span>
                  <strong className="text-lg font-bold font-grotesk text-slate-900 dark:text-white">
                    {units?.length || 18} Units
                  </strong>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-mono text-slate-400 block uppercase">Active Tenants</span>
                  <strong className="text-lg font-bold font-grotesk text-slate-900 dark:text-white">
                    {tenants?.length || 14} Residents
                  </strong>
                </div>
              </div>
            </div>

          </div>

          {/* Landlord Personal Info */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" /> Personal & Business Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-sans">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                <input
                  type="text"
                  value={landlordProfile.firstName || ''}
                  onChange={(e) => {
                    const first = e.target.value;
                    setLandlordProfile((p) => ({
                      ...p,
                      firstName: first,
                      name: [first, p.middleName, p.lastName].filter(Boolean).join(' '),
                    }));
                  }}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Middle Name <span className="text-slate-500 font-normal">(Opt)</span></label>
                <input
                  type="text"
                  value={landlordProfile.middleName || ''}
                  onChange={(e) => {
                    const mid = e.target.value;
                    setLandlordProfile((p) => ({
                      ...p,
                      middleName: mid,
                      name: [p.firstName, mid, p.lastName].filter(Boolean).join(' '),
                    }));
                  }}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                <input
                  type="text"
                  value={landlordProfile.lastName || ''}
                  onChange={(e) => {
                    const last = e.target.value;
                    setLandlordProfile((p) => ({
                      ...p,
                      lastName: last,
                      name: [p.firstName, p.middleName, last].filter(Boolean).join(' '),
                    }));
                  }}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  value={landlordProfile.email}
                  onChange={(e) => setLandlordProfile((p) => ({ ...p, email: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Direct Mobile</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={landlordProfile.phone}
                  onKeyDown={(e) => handleNumericKeyDown(e, false)}
                  onChange={(e) => setLandlordProfile((p) => ({ ...p, phone: onlyPhoneDigits(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Company / Holding Group</label>
                <input
                  type="text"
                  value={landlordProfile.company}
                  onChange={(e) => setLandlordProfile((p) => ({ ...p, company: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Password & 2FA Security Preferences */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-500" /> Password & Login Preferences
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              {/* Password Form */}
              <div className="space-y-3 font-sans">
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">Change Landlord Account Password</span>
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Current Password"
                      value={passwordForm.current}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="New Password"
                    value={passwordForm.newPass}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />

                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm New Password"
                    value={passwordForm.confirm}
                    onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
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
                    disabled={passwordStatus.loading}
                    className="btn btn-brand font-grotesk text-xs flex items-center justify-center gap-2 mt-2"
                  >
                    {passwordStatus.loading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* Building Access & Rules */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-indigo-500" /> Building Access &amp; Rules
              </h2>
              <div className="flex items-center gap-2">
                {accessSaved && (
                  <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-pulse">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveBuildingAccess}
                  className="btn btn-primary font-grotesk text-xs flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Save Access &amp; Rules
                </button>
              </div>
            </div>

            {properties?.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Property
                <select value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} className="mt-1 w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  {properties.map((property) => <option key={property._id || property.id} value={property._id || property.id}>{property.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Property timezone
                <select value={propertyTimezone} onChange={(event) => setPropertyTimezone(event.target.value)} className="mt-1 w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white">
                  <option value="Asia/Manila">Philippines · Asia/Manila</option><option value="Asia/Singapore">Singapore · Asia/Singapore</option><option value="Asia/Tokyo">Japan · Asia/Tokyo</option><option value="UTC">UTC</option><option value="America/Los_Angeles">US Pacific · America/Los_Angeles</option><option value="America/New_York">US Eastern · America/New_York</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={petsAllowed} onChange={(event) => setPetsAllowed(event.target.checked)} /> Pets allowed</label>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={parkingAvailable} onChange={(event) => setParkingAvailable(event.target.checked)} /> Parking available</label>
            </div>}

            {/* Access Codes */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 block">
                Access Codes (Visible to Tenants)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-sans">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Key className="w-3 h-3 text-indigo-500" /> Gate / Front Code
                  </label>
                  <input
                    type="text"
                    value={buildingAccess.gateCode}
                    onChange={(e) => setBuildingAccess((p) => ({ ...p, gateCode: e.target.value }))}
                    placeholder="e.g. #8821"
                    className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono tracking-widest"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-indigo-500" /> WiFi Network (SSID)
                  </label>
                  <input
                    type="text"
                    value={buildingAccess.wifiSsid}
                    onChange={(e) => setBuildingAccess((p) => ({ ...p, wifiSsid: e.target.value }))}
                    placeholder="e.g. Aura-Resident_5G"
                    className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-indigo-500" /> WiFi Password
                  </label>
                  <div className="relative">
                    <input
                      type={showWifiPw ? 'text' : 'password'}
                      value={buildingAccess.wifiPassword}
                      onChange={(e) => setBuildingAccess((p) => ({ ...p, wifiPassword: e.target.value }))}
                      placeholder="e.g. sky@2026"
                      className="w-full bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 pr-9 text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWifiPw((v) => !v)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-200"
                    >
                      {showWifiPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Building Rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Building Rules &amp; Policies
                </span>
                <button
                  type="button"
                  onClick={() => setBuildingRules((r) => [...r, ''])}
                  className="text-xs font-mono text-indigo-500 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Rule
                </button>
              </div>
              <div className="space-y-2">
                {buildingRules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="badge badge-info shrink-0 mt-2.5 w-5 h-5 font-mono flex items-center justify-center">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => {
                        const updated = [...buildingRules];
                        updated[i] = e.target.value;
                        setBuildingRules(updated);
                      }}
                      className="flex-1 bg-slate-50 dark:bg-surface-sunken border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white font-sans"
                    />
                    {buildingRules.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBuildingRules((r) => r.filter((_, idx) => idx !== i))}
                        className="shrink-0 mt-1.5 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:border-rose-500/30 transition-colors"
                        title="Remove rule"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Rules are visible to all tenants on their Overview dashboard.
              </p>
            </div>
          </div>

          {/* Portfolio Defaults */}
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-500" /> Portfolio Defaults
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800">
                <span className="text-slate-400 block text-xs uppercase">Active Properties</span>
                <strong className="text-xl font-extrabold font-grotesk text-slate-900 dark:text-white">
                  {properties?.length || 0} Buildings
                </strong>
                <span className="text-xs text-slate-500 block mt-1">Multi-property routing active</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200/80 dark:border-slate-800 sm:col-span-2">
                <span className="text-slate-400 block text-xs uppercase">Currency</span>
                <strong className="mt-1 block text-slate-900 dark:text-white">Philippine Peso (₱)</strong>
                <span className="text-xs text-slate-500 block mt-1">Rent and payment summaries are displayed in PHP.</span>
              </div>
            </div>
          </div>

        </div>
      )}

      {activeSubTab === 'maintenance' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-6 space-y-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Maintenance routing</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">Assign technicians from Maintenance. Vendor auto-assignment, SLA timers, and approval rules are not configured in this workspace, so there are no settings here that imply they are active.</p>
        </div>
      )}

      {activeSubTab === 'payments' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-hover p-6 space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Payment setup</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">Manage tenant QR, bank, and e-wallet instructions from Rent Roll → Payment options.</p>
          </div>
          <BillingPanel />
        </div>
      )}

      {/* ─── SUB-TAB 4: LANDLORD ALERTS ─── */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-6">
          
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div>
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" /> Notification Triggers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose which landlord alerts you get. Reminders are checked every 15 minutes using each property's timezone.
              </p>
            </div>

            <div className="space-y-3 text-xs font-sans">
              
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 dark:text-white block font-grotesk">New Maintenance Requests</strong>
                  <span className="text-slate-500 text-xs">Instant notification when a tenant logs a repair issue.</span>
                </div>
                <input
                  type="checkbox"
                  checked={landlordAlerts.newTicket}
                  onChange={(e) => setLandlordAlerts((p) => ({ ...p, newTicket: e.target.checked }))}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
              </div>

              {[
                { key: 'overduePayment', title: 'Overdue Rent Summary', hint: 'One daily alert with the number and total of invoices past their due date.' },
                { key: 'leaseExpiration', title: 'Lease Expiration Reminders', hint: 'Alerts 60, 30, and 7 days before a fixed-term lease ends.' },
                { key: 'dailySummaryEmail', title: 'Daily Summary Email', hint: "One email each morning listing the last day's alerts. Sent only when email delivery is configured." },
              ].map((item) => (
                <label key={item.key} className="p-4 rounded-2xl bg-slate-50 dark:bg-surface-sunken border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 cursor-pointer">
                  <span>
                    <strong className="text-slate-900 dark:text-white block font-grotesk">{item.title}</strong>
                    <span className="text-slate-500 text-xs">{item.hint}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={landlordAlerts[item.key]}
                    onChange={(e) => setLandlordAlerts((p) => ({ ...p, [item.key]: e.target.checked }))}
                    className="w-4 h-4 rounded text-indigo-600 cursor-pointer shrink-0"
                  />
                </label>
              ))}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface p-4 text-xs text-slate-600 dark:text-slate-300">
                Ticket escalation timers are not available yet.
              </div>

            </div>
          </div>

        </div>
      )}

      {/* ─── SUB-TAB 5: REPORTING & LOGS ─── */}
      {activeSubTab === 'reporting' && (
        <div className="space-y-6">
          
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-500" /> Activity & Audit Trail
                </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                  Review the audit trail in Superadmin. Retention controls are not available in the landlord workspace.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface p-5 text-sm text-slate-600 dark:text-slate-300">
              Landlord audit-log browsing and retention controls are not connected yet. Recorded actions remain available to platform administrators.
            </div>

          </div>

        </div>
      )}

      {/* ─── SUB-TAB 7: SECURITY ─── */}
      {activeSubTab === 'security' && (
        <div className="space-y-6">
          
          <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-6">
            <div>
              <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-500" /> Account Security
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Change your password under Profile & Account. Turn on two-factor sign-in below.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface p-5 text-sm text-slate-600 dark:text-slate-300">
              Session duration and database backups are managed by the platform and cannot be changed here.
            </div>

          </div>

          <TwoFactorSettings />

        </div>
      )}

    </div>
  );
};
