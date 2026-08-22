'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Modal } from './brut';
import { api } from '@/lib/client';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.61.27-3.16.76-4.59l-7.7-5.98A23.93 23.93 0 000 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
  );
}

export default function AuthModal({ open, onClose, onAuthed, reason }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setForm({ name: '', email: '', password: '' }); } }, [open]);

  const submit = async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { name: form.name, email: form.email, password: form.password };
      const d = await api(path, { method: 'POST', body });
      toast.success(mode === 'login' ? `Welcome back, ${d.user.name}!` : `Account created — welcome, ${d.user.name}!`);
      onAuthed(d.token, d.user);
    } catch (err) {
      toast.error(err.message);
      if (err.status === 409) setMode('login');
    } finally { setLoading(false); }
  };

  const google = () => {
    try {
      const redirect = window.location.origin + '/auth/callback';
      window.sessionStorage.setItem('dc_after_login', window.location.pathname + window.location.search);
      window.location.href = 'https://auth.emergentagent.com/?redirect=' + encodeURIComponent(redirect);
    } catch (e) { toast.error('Could not start Google login'); }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'login' ? '🔐 Log in' : '✨ Create account'}>
      <div className="space-y-4">
        {reason && (
          <div className="brut p-3 bg-[#FFE156] text-sm font-bold">{reason}</div>
        )}
        <div className="flex gap-2">
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`brut-btn flex-1 py-2 text-sm ${mode === m ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
              {m === 'login' ? 'Log in' : 'Register'}
            </button>
          ))}
        </div>

        <button onClick={google} className="brut-btn w-full py-3 bg-white flex items-center justify-center gap-2 font-bold">
          <GoogleIcon /> Continue with Google
        </button>
        <button
          onClick={() => toast.info('Apple Sign In needs Apple Developer keys (Team ID, Key ID, Services ID, .p8 key). Share them and I will switch it on.')}
          className="brut-btn w-full py-3 bg-black text-white flex items-center justify-center gap-2 font-bold">
          <span className="text-lg leading-none"></span> Continue with Apple
        </button>

        <div className="flex items-center gap-2 text-xs font-bold uppercase opacity-60">
          <div className="h-[3px] bg-black flex-1" /> or email <div className="h-[3px] bg-black flex-1" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Your name" className="brut w-full p-3 outline-none" />
          )}
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="you@email.com" className="brut w-full p-3 outline-none" />
          <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Password (min 6 chars)" className="brut w-full p-3 outline-none" />
          <button type="submit" disabled={loading} className="brut-btn w-full py-3 bg-[#FF5DA2] text-white text-lg">
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in →' : 'Create account →'}
          </button>
        </form>
        <p className="text-xs font-semibold opacity-70">
          {mode === 'login' ? "New here? Tap Register — it takes 10 seconds." : 'By registering you agree that listings are ranked by funds gathered and marked SPONSORED.'}
        </p>
      </div>
    </Modal>
  );
}
