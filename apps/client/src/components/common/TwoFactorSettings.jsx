import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { authApi } from '../../services/api';

const input = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface px-3 py-2 text-sm font-mono';

// Authenticator-app two-factor sign-in. Shared by landlord and tenant Settings.
export const TwoFactorSettings = () => {
  const [status, setStatus] = useState({ loading: true, enabled: false, method: null, emailAvailable: false });
  const [setup, setSetup] = useState(null); // authenticator: { secret, otpauthUrl }
  const [emailSetup, setEmailSetup] = useState(null); // { sentTo }
  const [disableCodeSent, setDisableCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authApi.getTwoFactorStatus()
      .then((res) => setStatus({ loading: false, enabled: Boolean(res.data?.enabled), method: res.data?.method || null, emailAvailable: Boolean(res.data?.emailAvailable) }))
      .catch(() => setStatus((s) => ({ ...s, loading: false })));
  }, []);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (e) { setError(e.message || 'Something went wrong.'); } finally { setBusy(false); }
  };

  const start = () => run(async () => { const res = await authApi.beginTwoFactorSetup(); setSetup(res.data); setCode(''); });
  const confirm = (e) => { e.preventDefault(); run(async () => {
    const res = await authApi.enableTwoFactor(code.trim());
    setRecoveryCodes(res.data.recoveryCodes);
    setSetup(null);
    setCode('');
    setStatus((s) => ({ ...s, enabled: true, method: 'totp' }));
  }); };
  const startEmail = () => run(async () => { const res = await authApi.beginEmailTwoFactor(); setEmailSetup(res.data); setCode(''); });
  const confirmEmail = (e) => { e.preventDefault(); run(async () => {
    const res = await authApi.enableEmailTwoFactor(code.trim());
    setRecoveryCodes(res.data.recoveryCodes);
    setEmailSetup(null);
    setCode('');
    setStatus((s) => ({ ...s, enabled: true, method: 'email' }));
  }); };
  const turnOff = (e) => { e.preventDefault(); run(async () => {
    await authApi.disableTwoFactor(password, code.trim());
    setPassword('');
    setCode('');
    setDisableCodeSent(false);
    setStatus((s) => ({ ...s, enabled: false, method: null }));
  }); };

  return (
    <div className="p-6 rounded-3xl apple-glass top-shade border border-slate-200 dark:border-slate-800/80 space-y-4 text-sm">
      <div>
        <h2 className="text-base font-bold font-grotesk text-slate-900 dark:text-white flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-500" /> Two-factor sign-in</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">After your password, JPTL asks for a 6-digit code{status.emailAvailable ? ', either from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) or sent to your email' : ' from an authenticator app such as Google Authenticator, Microsoft Authenticator, or 1Password'}.</p>
      </div>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      {status.loading ? <p className="text-xs text-slate-500">Checking…</p> : recoveryCodes ? (
        <div className="space-y-2">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">Two-factor sign-in is on.</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Save these recovery codes somewhere safe. Each one works once if you lose your phone. They will not be shown again.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs bg-slate-50 dark:bg-black rounded-xl p-3">{recoveryCodes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button type="button" onClick={() => setRecoveryCodes(null)} className="btn btn-secondary border text-xs">I saved them</button>
        </div>
      ) : status.enabled ? (
        <form onSubmit={turnOff} className="space-y-3">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">Two-factor sign-in is on ({status.method === 'email' ? 'email codes' : 'authenticator app'}).</p>
          <p className="text-xs text-slate-500">To turn it off, enter your password and a current code (or a recovery code).</p>
          {status.method === 'email' && <button type="button" disabled={busy} onClick={() => run(async () => { await authApi.sendTwoFactorDisableCode(); setDisableCodeSent(true); })} className="text-xs text-indigo-600 dark:text-indigo-400 underline">{disableCodeSent ? 'Code sent. Send again' : 'Email me a code'}</button>}
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="password" required autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} aria-label="Password" />
            <input required autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className={input} aria-label="Verification code" />
          </div>
          <button disabled={busy} className="rounded-xl border border-rose-300 text-rose-700 dark:text-rose-300 px-4 py-2 text-xs font-semibold disabled:opacity-50">Turn off two-factor sign-in</button>
        </form>
      ) : setup ? (
        <form onSubmit={confirm} className="space-y-3">
          <ol className="list-decimal pl-5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            <li>In your authenticator app, add an account and choose "enter a setup key".</li>
            <li>Enter this key (time-based): <code className="break-all font-mono bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded select-all">{setup.secret}</code></li>
            <li>Type the 6-digit code the app shows.</li>
          </ol>
          <a href={setup.otpauthUrl} className="text-xs text-indigo-600 dark:text-indigo-400 underline">On this phone? Open in authenticator app</a>
          <input autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} max-w-[10rem] text-center tracking-[0.3em]`} aria-label="Verification code" />
          <div className="flex gap-2">
            <button disabled={busy || code.length !== 6} className="btn btn-primary text-xs">Turn on</button>
            <button type="button" onClick={() => setSetup(null)} className="btn btn-secondary border text-xs">Cancel</button>
          </div>
        </form>
      ) : emailSetup ? (
        <form onSubmit={confirmEmail} className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">We sent a 6-digit code to <b>{emailSetup.sentTo}</b>. Enter it to turn on email codes.</p>
          <input autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} max-w-[10rem] text-center tracking-[0.3em]`} aria-label="Email code" />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || code.length !== 6} className="btn btn-primary text-xs">Turn on</button>
            <button type="button" disabled={busy} onClick={startEmail} className="rounded-xl border px-4 py-2 text-xs">Send again</button>
            <button type="button" onClick={() => setEmailSetup(null)} className="btn btn-secondary border text-xs">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={start} className="btn btn-brand text-xs">Use an authenticator app</button>
          {status.emailAvailable && <button type="button" disabled={busy} onClick={startEmail} className="rounded-xl border border-indigo-300 text-indigo-700 dark:text-indigo-300 px-4 py-2 text-xs font-semibold disabled:opacity-50">Use email codes</button>}
        </div>
      )}
    </div>
  );
};
