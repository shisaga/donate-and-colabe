'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shield, LogOut, RefreshCw } from 'lucide-react';
import { StatBox } from '@/components/brut';
import { api, fmt, useAuth } from '@/lib/client';

function LoginGate({ onAuthed }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const d = await api('/auth/login', { method: 'POST', body: form });
      if (d.user.role !== 'admin') throw new Error('This account is not an admin account');
      onAuthed(d.token, d.user);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="brut-lg bg-white p-6 w-full max-w-md space-y-4">
        <div className="flex items-center gap-2"><Shield size={22} strokeWidth={3} /><div className="font-comic text-3xl">Admin login</div></div>
        <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="admin email" className="brut w-full p-3 outline-none" />
        <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="password" className="brut w-full p-3 outline-none" />
        <button type="submit" disabled={loading} className="brut-btn w-full py-3 bg-[#FFE156] text-lg">{loading ? 'Checking...' : 'Enter dashboard →'}</button>
        <a href="/" className="block text-center text-xs font-bold underline">← back to site</a>
      </form>
    </div>
  );
}

const TABS = ['Overview', 'Listings', 'Payments', 'Users', 'Connects'];

export default function AdminPage() {
  const { user, ready, login, logout } = useAuth();
  const [tab, setTab] = useState('Overview');
  const [overview, setOverview] = useState(null);
  const [listings, setListings] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [users, setUsers] = useState([]);
  const [connects, setConnects] = useState([]);
  const [busy, setBusy] = useState(false);

  const loadTab = useCallback(async (t) => {
    setBusy(true);
    try {
      if (t === 'Overview') setOverview(await api('/admin/overview'));
      if (t === 'Listings') setListings((await api('/admin/listings')).listings || []);
      if (t === 'Payments') setContributions((await api('/admin/contributions')).contributions || []);
      if (t === 'Users') setUsers((await api('/admin/users')).users || []);
      if (t === 'Connects') setConnects((await api('/admin/connects')).connects || []);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }, []);

  useEffect(() => { if (user?.role === 'admin') loadTab(tab); }, [user, tab, loadTab]);

  if (!ready) return <div className="p-10 font-comic text-3xl">Loading...</div>;
  if (!user || user.role !== 'admin') return <LoginGate onAuthed={(t, u) => login(t, u)} />;

  const updateListing = async (id, patch) => {
    try {
      await api(`/admin/listings/${id}`, { method: 'PATCH', body: patch });
      toast.success('Updated');
      loadTab('Listings');
      setOverview(null);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-black bg-black text-[#FFE156]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield size={24} strokeWidth={3} />
            <div>
              <div className="font-comic text-2xl leading-none">Admin dashboard</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white">{user.email}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => loadTab(tab)} className="brut-btn px-3 py-2 bg-white text-black text-sm inline-flex items-center gap-1"><RefreshCw size={14} strokeWidth={3} /></button>
            <a href="/" className="brut-btn px-3 py-2 bg-[#FFE156] text-black text-sm">Site</a>
            <button onClick={logout} className="brut-btn px-3 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1"><LogOut size={14} strokeWidth={3} /></button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`brut-btn px-4 py-2 whitespace-nowrap text-sm ${tab === t ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>{t}</button>
          ))}
        </div>

        {busy && <div className="mt-4 font-bold text-sm">Loading...</div>}

        {tab === 'Overview' && overview && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox color="#FFE156" label="Total trending" value={fmt(overview.totalRaised)} sub={`${overview.totalBackers || 0} payments`} />
              <StatBox color="#A0F04D" label="Active profiles" value={overview.totalListings} sub={`${overview.activePromos} live battles`} />
              <StatBox color="#4DD4E6" label="Registered users" value={overview.users} sub={`${overview.connects} connect requests`} />
              <StatBox color="#B285FF" label="Platform volume" value={fmt(overview.totalRaised)} sub="paid visibility" />
              <StatBox color="#FF5DA2" label="Listings" value={overview.totalListings} sub={`${overview.rejected} rejected`} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="brut p-4 bg-white">
                <div className="font-comic text-2xl mb-2">Top trending profiles</div>
                {(overview.top || []).map((l, i) => (
                  <div key={l.id} className="flex items-center justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold">
                    <span>#{i + 1} {l.logo} {l.name}</span>
                    <span>{fmt(l.raised)}</span>
                  </div>
                ))}
              </div>
              <div className="brut p-4 bg-white">
                <div className="font-comic text-2xl mb-2">Latest payments</div>
                {(overview.recent || []).map(c => (
                  <div key={c.id} className="flex items-center justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold">
                    <span>{c.backerName} → {c.listingName}</span>
                    <span>{fmt(c.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatBox label="Registered users" value={overview.users} />
              <StatBox label="Connect requests" value={overview.connects} />
              <StatBox label="Paid ranking volume" value={fmt(overview.selfPaidTotal || overview.totalRaised)} sub="owners paying for position" />
            </div>
          </div>
        )}

        {tab === 'Listings' && (
          <div className="mt-5 grid gap-3">
            {listings.map(l => (
              <div key={l.id} className="brut p-4 bg-white flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 brut bg-[#FFE156] flex items-center justify-center text-xl">{l.logo}</div>
                  <div className="min-w-0">
                    <div className="font-comic text-xl leading-none truncate">{l.name}</div>
                    <div className="text-xs font-bold uppercase opacity-70">{l.category} • {l.status} • {fmt(l.raised)} • {l.backers} payments</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => updateListing(l.id, { status: 'APPROVED' })} className="brut-btn px-3 py-2 bg-[#A0F04D] text-xs">Approve</button>
                  <button onClick={() => updateListing(l.id, { status: 'REJECTED' })} className="brut-btn px-3 py-2 bg-[#FF5C4D] text-white text-xs">Reject</button>
                  <button onClick={() => updateListing(l.id, { verified: !l.verified })} className="brut-btn px-3 py-2 bg-white text-xs">{l.verified ? 'Unverify' : 'Verify'}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Payments' && (
          <div className="mt-5 brut p-4 bg-white">
            {contributions.map(c => (
              <div key={c.id} className="flex flex-wrap justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold gap-2">
                <span>🔥 {c.backerName} → {c.listingName}</span>
                <span>{fmt(c.amount)} • {new Date(c.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'Users' && (
          <div className="mt-5 brut p-4 bg-white">
            {users.map(u => (
              <div key={u.id} className="flex flex-wrap justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold gap-2">
                <span>{u.name} • {u.email}</span>
                <span>{u.role} • {u.provider || 'email'} • {new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'Connects' && (
          <div className="mt-5 brut p-4 bg-white">
            {connects.length === 0 && <div className="font-bold text-sm">No connect requests yet.</div>}
            {connects.map(c => (
              <div key={c.id} className="border-b-2 border-dashed border-black py-2 text-sm font-bold">
                <div>{c.userName} ({c.userEmail}) → {c.listingName}</div>
                {c.message && <div className="font-medium opacity-80">“{c.message}”</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
