import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { twoFactorApi } from '../services/superadminApi';

const input = 'w-full rounded-xl border border-line bg-surface-sunken px-3 py-2 text-sm font-mono text-ink-strong';

// Superadmin two-factor sign-in (authenticator app only).
export const SecurityTab = () => {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { twoFactorApi.status().then((r) => setEnabled(Boolean(r.data?.enabled))).catch((e) => setError(e.message)); }, []);

  const run = async (fn) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (e) { setError(e.message || 'Something went wrong.'); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-xl rounded-3xl border border-line bg-surface p-6 space-y-4 text-sm text-ink-strong">
      <h2 className="text-base font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-indigo-400" /> Two-factor sign-in</h2>
      <p className="text-xs text-ink-muted">Superadmin sign-in requires a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) after your password.</p>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      {enabled === null ? <p className="text-xs text-ink-muted">Checking…</p> : recoveryCodes ? (
        <div className="space-y-2">
          <p className="text-emerald-400 font-semibold">Two-factor sign-in is on.</p>
          <p className="text-xs text-ink-muted">Save these recovery codes offline. Each works once. They won't be shown again.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-xs bg-surface-sunken rounded-xl p-3">{recoveryCodes.map((c) => <li key={c}>{c}</li>)}</ul>
          <button type="button" onClick={() => setRecoveryCodes(null)} className="btn btn-secondary border text-xs">I saved them</button>
        </div>
      ) : enabled ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { await twoFactorApi.disable(password, code.trim()); setEnabled(false); setPassword(''); setCode(''); }); }} className="space-y-3">
          <p className="text-emerald-400 font-semibold">Two-factor sign-in is on.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} aria-label="Password" />
            <input required placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className={input} aria-label="Code" />
          </div>
          <button disabled={busy} className="rounded-xl border border-rose-500/40 text-rose-300 px-4 py-2 text-xs disabled:opacity-50">Turn off</button>
        </form>
      ) : setup ? (
        <form onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await twoFactorApi.enable(code.trim()); setRecoveryCodes(r.data.recoveryCodes); setEnabled(true); setSetup(null); setCode(''); }); }} className="space-y-3">
          <ol className="list-decimal pl-5 space-y-1 text-xs text-ink-soft">
            <li>In your authenticator app, add an account using a setup key.</li>
            <li>Key (time-based): <code className="break-all bg-surface px-1.5 py-0.5 rounded select-all">{setup.secret}</code></li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <input autoFocus required inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${input} max-w-[10rem] text-center tracking-[0.3em]`} aria-label="Code" placeholder="123456" />
          <div className="flex gap-2">
            <button disabled={busy || code.length !== 6} className="btn btn-primary text-xs">Turn on</button>
            <button type="button" onClick={() => setSetup(null)} className="btn btn-secondary border text-xs">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" disabled={busy} onClick={() => run(async () => setSetup((await twoFactorApi.begin()).data))} className="btn btn-brand text-xs">Set up authenticator app</button>
      )}
    </div>
  );
};
