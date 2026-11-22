import React, { useState } from 'react';
import { motion } from 'framer-motion';

// Landlord <-> resident sign-in: the dark panel and the form slide past each other.
const PANEL_SWAP = { layout: { duration: 0.6, ease: [0.77, 0, 0.175, 1] } };
import { Building2, Eye, EyeOff, AlertCircle, Loader2, ArrowRight, Sun, Moon, CheckCircle2, Lock } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { authApi, landlordApi, tenantApi } from '../services/api';

export const LoginPage = ({ onNavigate = () => {}, portal = 'default' }) => {
  const isTenantPortal = portal === 'tenant';
  React.useEffect(() => { setApiError(null); setErrors({}); setTouched({}); }, [portal]); // eslint-disable-line react-hooks/exhaustive-deps
  const { theme, toggleTheme } = useTheme();
  const { login, completeTwoFactor } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [targetPortal, setTargetPortal] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState('totp');
  const [resendNote, setResendNote] = useState('');

  const validateField = (name, value) => {
    let error = '';
    if (name === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!value.trim()) {
        error = 'Email address is required';
      } else if (!emailRegex.test(value.trim())) {
        error = 'Enter a valid email address';
      }
    } else if (name === 'password') {
      if (!value) {
        error = 'Password is required';
      } else if (value.length < 6) {
        error = 'Password must be at least 6 characters';
      }
    }

    return error;
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = field === 'email' ? email : password;
    setErrors((prev) => ({ ...prev, [field]: validateField(field, val) }));
  };

  const handleChange = (field, val) => {
    if (field === 'email') setEmail(val);
    if (field === 'password') setPassword(val);
    setApiError(null);

    if (touched[field]) {
      setErrors((prev) => ({ ...prev, [field]: validateField(field, val) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);

    const emailErr = validateField('email', email);
    const passErr = validateField('password', password);

    if (emailErr || passErr) {
      setErrors({ email: emailErr, password: passErr });
      setTouched({ email: true, password: true });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await login(email, password, isTenantPortal ? 'tenant' : 'landlord');
      if (res?.twoFactorRequired) {
        setChallengeToken(res.challengeToken);
        setTwoFactorMethod(res.method || 'totp');
        setResendNote('');
        setIsSubmitting(false);
        return;
      }
      finishLogin(res);
    } catch (err) {
      setIsSubmitting(false);
      setApiError(err.message || 'Invalid email or password. Please check your credentials.');
    }
  };

  const handleTwoFactorSubmit = async (e) => {
    e.preventDefault();
    setApiError(null);
    setIsSubmitting(true);
    try {
      finishLogin(await completeTwoFactor(challengeToken, twoFactorCode.trim(), email));
    } catch (err) {
      setIsSubmitting(false);
      setApiError(err.message || 'That code is not valid.');
      if (err.status === 401 && /expired|again/i.test(err.message || '')) { setChallengeToken(''); setTwoFactorCode(''); }
    }
  };

  const finishLogin = (res) => {
    {
      const userRole = res?.user?.role || res?.role;
      const isTenant = userRole === 'tenant';

      // Prefetch data immediately so it's resolving or completed when dashboard mounts
      if (isTenant) {
        tenantApi.prefetchPortalInit();
      } else if (userRole === 'landlord') {
        landlordApi.prefetchDashInit();
      }

      setIsSubmitting(false);
      setIsSuccess(true);
      setTargetPortal(isTenant ? 'Resident Portal' : 'Landlord Console');

      // Navigate immediately with zero delay
      if (isTenant) {
        onNavigate('/tenant');
      } else {
        onNavigate('/dashboard');
      }
    }
  };

  return (
    <div className={`min-h-screen w-full flex flex-col ${isTenantPortal ? 'md:flex-row-reverse' : 'md:flex-row'} bg-slate-50 dark:bg-surface-sunken text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-600/30 selection:text-indigo-300`}>
      
      {/* LEFT PANEL: Split Screen Hero */}
      <motion.div layout transition={PANEL_SWAP} className={`w-full md:w-[45%] lg:w-[42%] min-h-[340px] md:min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 dark:from-surface dark:via-surface dark:to-surface p-6 sm:p-10 md:p-12 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 ${isTenantPortal ? 'md:border-l' : 'md:border-r'} border-slate-200/10 dark:border-white/[0.08]`}>
        
        {/* Glow Ambient Layering */}
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-[480px] h-[480px] bg-purple-600/15 rounded-full blur-[100px] pointer-events-none" />

        {/* Top Logo Badge & Theme Toggle */}
        <div className="relative z-10 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="flex items-center gap-3 group focus:outline-none"
          >
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 font-bold group-hover:scale-105 transition-transform duration-200 ease-out">
              <Building2 className="w-5 h-5" />
            </div>
            <span className="font-grotesk font-extrabold text-xl tracking-tight text-white">
              JPTL<span className="text-indigo-400">.SYSTEM</span>
            </span>
          </a>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle Light/Dark Theme"
            className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/15 active:scale-95 text-white border border-white/15 backdrop-blur-xl transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-200" />}
          </button>
        </div>

        {/* Center Content */}
        <div className="relative z-10 my-10 md:my-auto space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.06] text-indigo-300 border border-white/10 flex items-center justify-center backdrop-blur-xl shadow-2xl">
            <Lock className="w-7 h-7" />
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-grotesk text-white leading-[1.08] tracking-[-0.03em]">
            Welcome Back.
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-md leading-relaxed font-sans font-normal">
            {isTenantPortal
              ? 'Sign in to view your lease, payments, documents, and maintenance requests.'
              : 'For landlords, property managers and technicians. Residents sign in on the resident page.'}
          </p>

          {/* Statistics Cards */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-xl">
              <span className="text-2xl sm:text-3xl font-extrabold font-grotesk text-white block tracking-tight">2,480+</span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Managed Units</span>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl shadow-xl">
              <span className="text-2xl sm:text-3xl font-extrabold font-grotesk text-white block tracking-tight">98.4%</span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Occupancy Rate</span>
            </div>
          </div>
        </div>

        {/* Bottom Footer Note */}
        <div className="relative z-10 text-xs text-slate-400 font-mono tracking-wide">
          JPTL Unified Portal &bull; Secure Authentication
        </div>
      </motion.div>

      {/* RIGHT PANEL: Form Content */}
      <motion.div layout transition={PANEL_SWAP} className="flex-1 flex flex-col justify-between p-6 sm:p-10 md:p-14 lg:p-16 max-w-xl mx-auto w-full my-auto">
        
        <div>
          {/* Header Title */}
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-grotesk text-slate-900 dark:text-white tracking-tight">
              {isTenantPortal ? 'Tenant sign in' : 'Sign In to Your Account'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5 font-sans">
              {isTenantPortal ? 'Use the account invitation from your landlord to sign in.' : 'Enter your credentials below to access your portal'}
            </p>
          </div>

          {/* Error Alert Banner */}
          {apiError && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-3 animate-in fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
              <div className="flex-1 font-sans">
                <span className="font-bold block">Authentication Failed</span>
                <span>{apiError}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {isSuccess && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-xs text-center flex flex-col items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <span className="font-bold text-sm text-slate-900 dark:text-white">Authenticated!</span>
              <span className="text-slate-600 dark:text-slate-300">
                Entering {targetPortal}...
              </span>
            </div>
          )}

          {challengeToken && (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Enter your verification code</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{twoFactorMethod === 'email' ? `We emailed a 6-digit code to ${email}. It expires in 10 minutes.` : 'Open your authenticator app and enter the 6-digit code for JPTL.'} You can also use one of your recovery codes.</p>
              </div>
              {apiError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{apiError}</p>}
              <input
                autoFocus
                required
                autoComplete="one-time-code"
                inputMode="text"
                maxLength={11}
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-4 py-3 text-center font-mono text-lg tracking-[0.3em]"
                placeholder="123456"
                aria-label="Verification code"
              />
              <button disabled={isSubmitting || !twoFactorCode.trim()} className="btn btn-primary w-full text-sm">{isSubmitting ? 'Verifying…' : 'Verify and sign in'}</button>
              {twoFactorMethod === 'email' && <button type="button" onClick={async () => { try { await authApi.resendTwoFactorCode(challengeToken); setResendNote('A new code was sent.'); } catch (err) { setResendNote(err.message || 'Could not send a new code.'); } }} className="w-full text-xs text-indigo-600 dark:text-indigo-400 underline">Send a new code</button>}
              {resendNote && <p className="text-center text-xs text-slate-500">{resendNote}</p>}
              <button type="button" onClick={() => { setChallengeToken(''); setTwoFactorCode(''); setApiError(null); }} className="w-full text-xs text-slate-500 underline">Use a different account</button>
            </form>
          )}

          {/* Login Form */}
          {!challengeToken && <form onSubmit={handleSubmit} noValidate className="space-y-4">
            
            {/* Email Address */}
            <div>
              <label htmlFor="login-email" className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 block">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                disabled={isSubmitting || isSuccess}
                value={email}
                onChange={(e) => handleChange('email', e.target.value)}
                onBlur={() => handleBlur('email')}
                placeholder="name@example.com"
                className={`w-full bg-white dark:bg-surface border ${
                  touched.email && errors.email
                    ? 'border-rose-500 focus:ring-rose-500'
                    : 'border-slate-300 dark:border-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15'
                } rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none shadow-sm`}
              />
              {touched.email && errors.email && (
                <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate('/forgot-password')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={isSubmitting || isSuccess}
                  value={password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  placeholder="Enter your password"
                  className={`w-full bg-white dark:bg-surface border ${
                    touched.password && errors.password
                      ? 'border-rose-500 focus:ring-rose-500'
                      : 'border-slate-300 dark:border-slate-800 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15'
                  } rounded-2xl pl-4 pr-11 py-3 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none shadow-sm`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-700 dark:hover:text-white active:scale-95 transition-all p-0.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.password && errors.password && (
                <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{errors.password}</span>
                </p>
              )}
            </div>

            {/* Submit Action Button */}
            <button
              type="submit"
              disabled={isSubmitting || isSuccess}
              className="btn btn-brand btn-icon w-full py-3.5 px-4 font-grotesk text-xs sm:text-sm active:scale-[0.97] flex items-center justify-center gap-2 ease-out focus:outline-none focus:ring-2 mt-6 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

          </form>}
        </div>

        {/* Footer Note */}
        <div className="mt-8 pt-6 border-t border-slate-200/80 dark:border-slate-800/80 text-center text-xs text-slate-600 dark:text-slate-400 space-y-2">
          {isTenantPortal ? (
            <div>
              Are you a landlord or staff member?{' '}
              <button type="button" onClick={() => onNavigate('/login')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                Go to workspace sign in
              </button>
            </div>
          ) : (
            <>
              <div>
                Need a landlord account?{' '}
                <button type="button" onClick={() => onNavigate('/register')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                  Create one now
                </button>
              </div>
              <button type="button" onClick={() => onNavigate('/tenant-login')} className="btn btn-secondary w-full">
                I’m a resident: go to resident sign in
              </button>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                Resident access is granted by your landlord or property management office.
              </div>
            </>
          )}
        </div>

      </motion.div>

    </div>
  );
};
