'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shield, LogOut, RefreshCw } from 'lucide-react';
import { StatBox, Sticker } from '@/components/brut';
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

const TABS = ['Overview', 'Listings', 'Payouts', 'Help fund', 'Investors', 'Users', 'Connects'];

export default function AdminPage() {
  const { user, ready, login, logout } = useAuth();
  const [tab, setTab] = useState('Overview');
  const [overview, setOverview] = useState(null);
  const [listings, setListings] = useState([]);
  const [payouts, setPayouts] = useState({ payouts: [], history: [] });
  const [contributions, setContributions] = useState([]);
  const [users, setUsers] = useState([]);
  const [connects, setConnects] = useState([]);
  const [charity, setCharity] = useState({ items: [] });
  const [give, setGive] = useState({ amount: '', beneficiary: '', note: '' });
  const [busy, setBusy] = useState(false);

  const loadTab = useCallback(async (t) => {
    setBusy(true);
    try {
      if (t === 'Overview') setOverview(await api('/admin/overview'));
      if (t === 'Listings') setListings((await api('/admin/listings')).listings || []);
      if (t === 'Payouts') setPayouts(await api('/admin/payouts'));
      if (t === 'Investors') setContributions((await api('/admin/contributions')).contributions || []);
      if (t === 'Users') setUsers((await api('/admin/users')).users || []);
      if (t === 'Connects') setConnects((await api('/admin/connects')).connects || []);
      if (t === 'Help fund') setCharity(await api('/admin/charity'));
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

  const pay = async (row) => {
    try {
      await api('/admin/payouts', { method: 'POST', body: { listingId: row.listingId, amount: row.due } });
      toast.success(`Paid ${fmt(row.due)} to ${row.name}`);
      loadTab('Payouts');
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
              <StatBox color="#FFE156" label="Total gathering" value={fmt(overview.totalRaised)} sub={`${fmt(overview.selfPaidTotal)} self-paid \u2022 ${fmt(overview.donatedTotal)} donated`} />
              <StatBox color="#A0F04D" label="Creator pool (30%)" value={fmt(overview.creatorPool)} sub={`${fmt(overview.paidOut)} already paid`} />
              <StatBox color="#4DD4E6" label="Help fund (40%)" value={fmt(overview.charityPool)} sub={`${fmt(overview.charityGiven)} given \u2022 ${fmt(overview.charityRemaining)} left`} />
              <StatBox color="#B285FF" label="Servers + devs (30%)" value={fmt(overview.platformPool)} sub="hosting & developer payout" />
              <StatBox color="#FF5DA2" label="Listings" value={overview.totalListings} sub={`${overview.activePromos} sponsored • ${overview.rejected} rejected`} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="brut p-4 bg-white">
                <div className="font-comic text-2xl mb-2">Top gathering listings</div>
                {(overview.top || []).map((l, i) => (
                  <div key={l.id} className="flex items-center justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold">
                    <span>#{i + 1} {l.logo} {l.name}</span>
                    <span>{fmt(l.raised)} <span className="opacity-60">(30% = {fmt(l.creatorShare)})</span></span>
                  </div>
                ))}
              </div>
              <div className="brut p-4 bg-white">
                <div className="font-comic text-2xl mb-2">Latest investments</div>
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
              <StatBox label="Creator share" value={`${overview.creatorSharePct}%`} sub="of total gathering" />
              <StatBox label="Fan donations" value={overview.donationCount || 0} sub={fmt(overview.donatedTotal)} />
              <StatBox label="Self-paid ranking" value={fmt(overview.selfPaidTotal)} sub="owners paying for position" />
              <StatBox label="Fan donations" value={overview.donationCount || 0} sub={fmt(overview.donatedTotal)} />
              <StatBox label="Self-paid ranking" value={fmt(overview.selfPaidTotal)} sub="owners paying for position" />
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
                    <div className="text-xs font-bold uppercase opacity-70">{l.category} • {l.status} • {fmt(l.raised)} • {l.backers} investors</div>
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

        {tab === 'Payouts' && (
          <div className="mt-5 space-y-4">
            <div className="brut p-4 bg-[#FFE156] font-bold text-sm">Creators can claim <b>30%</b> of their total gathering. Pay the due amount and it is logged below.</div>
            <div className="grid gap-3">
              {(payouts.payouts || []).map(row => (
                <div key={row.listingId} className="brut p-4 bg-white flex flex-wrap items-center justify-between gap-3">
                  <div className="font-bold text-sm">
                    <div className="font-comic text-xl">{row.logo} {row.name}</div>
                    Gathered {fmt(row.raised)} • 30% = {fmt(row.share)} • paid {fmt(row.paidOut)}
                  </div>
                  <div className="flex items-center gap-3">
                    <Sticker color={row.due > 0 ? '#FF5DA2' : '#A0F04D'}>
                      <span className={row.due > 0 ? 'text-white' : ''}>{row.due > 0 ? `DUE ${fmt(row.due)}` : 'SETTLED'}</span>
                    </Sticker>
                    <button disabled={row.due < 1} onClick={() => pay(row)} className="brut-btn px-4 py-2 bg-[#A0F04D] text-sm disabled:opacity-40">Mark paid</button>
                  </div>
                </div>
              ))}
            </div>
            {(payouts.history || []).length > 0 && (
              <div className="brut p-4 bg-white">
                <div className="font-comic text-2xl mb-2">Payout history</div>
                {payouts.history.map(h => (
                  <div key={h.id} className="flex justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold">
                    <span>{h.listingName}</span><span>{fmt(h.amount)} • {new Date(h.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}


        {tab === 'Help fund' && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatBox color="#4DD4E6" label="Help fund (40%)" value={fmt(charity.charityPool)} sub="of total gathering" />
              <StatBox color="#A0F04D" label="Already given" value={fmt(charity.charityGiven)} sub={`${(charity.items || []).length} disbursements`} />
              <StatBox color="#FFE156" label="Available to give" value={fmt(charity.charityRemaining)} sub="ready for the next family/cause" />
            </div>
            <div className="brut p-4 bg-white space-y-3">
              <div className="font-comic text-2xl">Record a disbursement</div>
              <div className="grid md:grid-cols-3 gap-2">
                <input value={give.beneficiary} onChange={e => setGive(g => ({ ...g, beneficiary: e.target.value }))} placeholder="Who received it (name / NGO)" className="brut p-3 outline-none" />
                <input type="number" value={give.amount} onChange={e => setGive(g => ({ ...g, amount: e.target.value }))} placeholder="Amount" className="brut p-3 outline-none" />
                <input value={give.note} onChange={e => setGive(g => ({ ...g, note: e.target.value }))} placeholder="Note (optional)" className="brut p-3 outline-none" />
              </div>
              <button
                onClick={async () => {
                  try {
                    await api('/admin/charity', { method: 'POST', body: { amount: give.amount, beneficiary: give.beneficiary, note: give.note } });
                    toast.success('Disbursement recorded');
                    setGive({ amount: '', beneficiary: '', note: '' });
                    loadTab('Help fund');
                  } catch (e) { toast.error(e.message); }
                }}
                className="brut-btn px-5 py-3 is-lime bg-[#A0F04D]">Give from help fund</button>
            </div>
            <div className="brut p-4 bg-white">
              <div className="font-comic text-2xl mb-2">Disbursement history</div>
              {(charity.items || []).length === 0 && <div className="text-sm font-bold">Nothing given yet.</div>}
              {(charity.items || []).map(i => (
                <div key={i.id} className="flex flex-wrap justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold gap-2">
                  <span>❤️ {i.beneficiary} {i.note ? `— ${i.note}` : ''}</span>
                  <span>{fmt(i.amount)} • {new Date(i.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'Investors' && (
          <div className="mt-5 brut p-4 bg-white">
            {contributions.map(c => (
              <div key={c.id} className="flex flex-wrap justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold gap-2">
                <span>{c.kind === 'SELF_PAY' ? '👑' : '❤️'} {c.backerName} → {c.listingName}</span>
                <span>{fmt(c.amount)} • {c.kind === 'SELF_PAY' ? 'self-paid' : 'donation'} • {new Date(c.createdAt).toLocaleString()}</span>
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
