'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Trophy, Rocket, Zap, Share2, Plus, TrendingUp, Flame, ExternalLink, Crown, ArrowUp,
  Clock, Users, IndianRupee, ChevronRight, LogOut, LayoutDashboard, Shield, Instagram, HeartHandshake, PiggyBank
} from 'lucide-react';
import { Modal, Sticker, StatBox } from '@/components/brut';
import AuthModal from '@/components/AuthModal';
import InvestModal from '@/components/InvestModal';
import ConnectModal from '@/components/ConnectModal';
import ProfilePicker from '@/components/ProfilePicker';
import { api, fmt, share30, timeLeft, useAuth } from '@/lib/client';
import { useMoney } from '@/lib/currency';

const COLORS = ['#FFE156', '#FF5DA2', '#4DD4E6', '#FF5C4D', '#A0F04D', '#B285FF', '#FFB84D'];

/* ----------------------------- header ----------------------------- */
function CurrencySwitcher() {
  const { currency, currencies, setCurrency } = useMoney();
  return (
    <select
      value={currency}
      onChange={e => setCurrency(e.target.value)}
      aria-label="Currency"
      className="brut px-2 py-2 text-xs font-bold bg-white outline-none cursor-pointer"
    >
      {(currencies || []).map(c => (
        <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
      ))}
    </select>
  );
}

function Header({ user, onLogin, onLogout, onSubmit }) {
  return (
    <header className="border-b-4 border-black bg-[#FFE156] halftone" style={{ backgroundBlendMode: 'multiply' }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
        <a href="/" className="flex items-center gap-3">
          <div className="w-11 h-11 bg-black text-[#FFE156] flex items-center justify-center font-comic text-2xl" style={{ borderWidth: 3 }}>D&amp;C</div>
          <div>
            <div className="font-comic text-2xl leading-none">Donate &amp; Colab</div>
            <div className="text-[11px] font-semibold tracking-wider uppercase">List • Pay for #1 • Get donations</div>
          </div>
        </a>
        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          <a href="#instagram" className="hidden lg:inline-block brut-btn px-3 py-2 bg-white text-sm">📸 Instagram</a>
          <a href="#leaderboard" className="hidden md:inline-block brut-btn px-3 py-2 bg-white text-sm">Rankings</a>
          {user ? (
            <>
              <a href="/dashboard" className="brut-btn px-3 py-2 bg-white text-sm inline-flex items-center gap-1">
                <LayoutDashboard size={14} strokeWidth={3} /> <span className="hidden sm:inline">Dashboard</span>
              </a>
              {user.role === 'admin' && (
                <a href="/admin" className="brut-btn px-3 py-2 bg-black text-[#FFE156] text-sm inline-flex items-center gap-1">
                  <Shield size={14} strokeWidth={3} /> Admin
                </a>
              )}
              <button onClick={onLogout} className="brut-btn px-3 py-2 bg-white text-sm inline-flex items-center gap-1">
                <LogOut size={14} strokeWidth={3} />
              </button>
            </>
          ) : (
            <button onClick={onLogin} className="brut-btn px-4 py-2 bg-white text-sm font-bold">Log in</button>
          )}
          <button onClick={onSubmit} className="brut-btn px-4 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1">
            <Plus size={16} strokeWidth={3} /> List
          </button>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------- hero ----------------------------- */
function Hero({ stats, onSubmit }) {
  const { money } = useMoney();
  return (
    <section className="relative overflow-hidden border-b-4 border-black">
      <div className="absolute inset-0 halftone opacity-30" />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-8 md:py-16 relative">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 items-center">
          <div>
            <div className="flex flex-wrap gap-2 mb-5">
              <Sticker color="#4DD4E6" rotate={-4}>🔥 LIVE FUNDING BOARD</Sticker>
              <Sticker color="#A0F04D" rotate={3}>{stats.viewersOnline || 42} people online</Sticker>
            </div>
            <h1 className="font-comic text-4xl sm:text-5xl md:text-7xl leading-[0.95] md:leading-[0.92] tracking-wide break-words">
              LIST YOUR ID.<br />
              PAY FOR #1.<br />
              <span className="bg-black text-[#FFE156] px-3 inline-block -rotate-1">OR GET DONATIONS.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl max-w-xl font-medium">
              List your Instagram ID, app or startup. <b>Pay to grab rank #1</b> — or let your fans
              <b> donate from ₹1 (no upper cap)</b> to push you higher. Two ways up the same public board,
              and <b>you keep 30% of everything gathered</b> for maintaining and growing your work.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#leaderboard" className="brut-btn px-6 py-3 bg-[#A0F04D] text-lg inline-flex items-center gap-2">
                <PiggyBank size={20} strokeWidth={3} /> Donate from ₹1
              </a>
              <button onClick={onSubmit} className="brut-btn px-6 py-3 bg-[#FF5DA2] text-white text-lg inline-flex items-center gap-2">
                <Rocket size={20} strokeWidth={3} /> List &amp; pay for #1
              </button>
              <a href="#instagram" className="brut-btn px-6 py-3 bg-white text-lg inline-flex items-center gap-2">
                <Instagram size={20} strokeWidth={3} /> Trending IG
              </a>
            </div>
          </div>

          <div className="brut-lg bg-black text-white p-4 sm:p-6 md:-rotate-1">
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#FFE156]">Total gathering so far</div>
            <div className="font-comic text-4xl sm:text-5xl md:text-6xl text-[#FFE156] leading-none mt-2 break-words">{money(stats.totalRaised)}</div>
            <div className="text-sm font-semibold mt-2">from <b>{stats.totalBackers || 0}</b> payments across <b>{stats.totalListings || 0}</b> listings</div>
            <div className="brut mt-4 p-3 bg-[#A0F04D] text-black">
              <div className="text-[11px] font-bold uppercase">You can get 30% of your total gathering</div>
              <div className="font-comic text-3xl leading-tight">{money(stats.creatorPool)}</div>
              <div className="text-xs font-bold">earmarked for listing owners — to maintain &amp; upgrade their work</div>
            </div>
            <div className="brut mt-3 p-3 bg-[#4DD4E6] text-black">
              <div className="text-[11px] font-bold uppercase">40% goes to people in need</div>
              <div className="font-comic text-3xl leading-tight">{money(stats.charityPool)}</div>
              <div className="text-xs font-bold">the help fund, published openly</div>
            </div>
            <div className="text-[11px] font-semibold mt-3 opacity-80">The last 30% keeps the servers running and pays the developers. Every paid position is tagged SPONSORED.</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GatheringStrip({ stats }) {
  const { money } = useMoney();
  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 -mt-2 pt-8">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatBox color="#FFE156" label="Total gathering" value={money(stats.totalRaised)} sub={`${money(stats.selfPaidTotal)} self-paid • ${money(stats.donatedTotal)} donated`} />
        <StatBox color="#A0F04D" label="Creator share (30%)" value={money(stats.creatorPool)} sub="payable to listing owners" />
        <StatBox color="#4DD4E6" label="Help fund (40%)" value={money(stats.charityPool)} sub="for people who need it" />
        <StatBox color="#B285FF" label="Servers + devs (30%)" value={money(stats.platformPool)} sub="keeps the lights on" />
        <StatBox color="#FF5DA2" label="Live listings" value={stats.totalListings || 0} sub={`${stats.totalBackers || 0} payments • ${stats.activePromos || 0} sponsored`} />
      </div>
    </section>
  );
}

function ActivityMarquee({ activity }) {
  const { money } = useMoney();
  const items = activity.length ? [...activity, ...activity] : [];
  if (!items.length) return null;
  return (
    <div className="border-y-4 border-black bg-black text-[#FFE156] overflow-hidden">
      <div className="marquee-track whitespace-nowrap py-2 font-semibold text-sm">
        {items.map((e, i) => (
          <span key={i} className="inline-flex items-center gap-2 mx-6">
            <Zap size={14} className="text-[#FF5DA2]" fill="#FF5DA2" />
            {e.eventType === 'SELF_PAY'
              ? (<><b>{e.listingName}</b> paid <span className="text-white">{money(e.amount)}</span> to climb the board</>)
              : (<><b>{e.backerName || 'Someone'}</b> donated <span className="text-white">{money(e.amount)}</span> to <b>{e.listingName}</b></>)}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- listings ----------------------------- */
function CategoryTabs({ categories, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <button onClick={() => onChange('all')}
        className={`brut-btn px-4 py-2 whitespace-nowrap ${active === 'all' ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
        🏆 All
      </button>
      {categories.map(c => (
        <button key={c.id} onClick={() => onChange(c.id)}
          className={`brut-btn px-4 py-2 whitespace-nowrap ${active === c.id ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
          {c.emoji} {c.name} <span className="opacity-60 text-xs">({c.count})</span>
        </button>
      ))}
    </div>
  );
}

function RankBadge({ rank }) {
  const bg = rank === 1 ? '#FFE156' : rank === 2 ? '#4DD4E6' : rank === 3 ? '#FF5DA2' : '#fff';
  return (
    <div className="brut inline-flex items-center gap-1 px-3 py-2 font-comic text-2xl" style={{ background: bg, boxShadow: '4px 4px 0 #000' }}>
      {rank === 1 ? <Crown size={16} strokeWidth={3} /> : null} #{rank}
    </div>
  );
}

function ListingCard({ listing, onInvest, onConnect, onShare }) {
  const { money, fromBase } = useMoney();
  const color = COLORS[(listing.rank - 1) % COLORS.length];
  const isTop3 = listing.rank <= 3;
  return (
    <div className={`brut p-3 sm:p-4 md:p-5 relative pop overflow-hidden`} style={{ background: isTop3 ? color : '#fff' }}>
      {isTop3 && <div className="absolute -top-3 -left-3"><Sticker color="#000" rotate={-8}><span className="text-white">🔥 TOP {listing.rank}</span></Sticker></div>}
      <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
        <RankBadge rank={listing.rank} />
        {listing.image ? (
          <img src={listing.image} alt={listing.name} className="w-14 h-14 flex-shrink-0 brut object-cover bg-white" style={{ boxShadow: '3px 3px 0 #000' }} />
        ) : (
          <div className="w-14 h-14 flex-shrink-0 brut flex items-center justify-center text-3xl bg-white" style={{ boxShadow: '3px 3px 0 #000' }}>
            {listing.logo}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-comic text-xl sm:text-2xl leading-tight break-all">{listing.name}</h3>
            {listing.sponsored && <Sticker color="#FF5DA2" rotate={-2}><span className="text-white">SPONSORED</span></Sticker>}
            {listing.verified && <Sticker color="#A0F04D" rotate={2}>✓ VERIFIED</Sticker>}
          </div>
          <p className="text-sm font-medium mt-1 opacity-90">{listing.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs font-bold">
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1">
              {money(listing.raised)} gathered
            </span>
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1">
              <HeartHandshake size={11} strokeWidth={3} /> {listing.backers || 0} backers
            </span>
            <span className="brut px-2 py-1 bg-[#A0F04D] inline-flex items-center gap-1">
              30% share = {money(listing.creatorShare)}
            </span>
            {listing.promotionExpiry && (
              <span className="inline-flex items-center gap-1 text-[#FF5C4D]"><Clock size={12} strokeWidth={3} /> highlight ends in {timeLeft(listing.promotionExpiry)}</span>
            )}
            {listing.website && (
              <a href={listing.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                <ExternalLink size={12} strokeWidth={3} /> Visit
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <button onClick={() => onInvest(listing, 'SELF_PAY')} className="brut-btn px-4 py-2 bg-[#FFE156] text-sm inline-flex items-center justify-center gap-1">
            <Crown size={14} strokeWidth={3} /> Pay to rank
          </button>
          <button onClick={() => onInvest(listing, 'DONATION')} className="brut-btn px-4 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center justify-center gap-1">
            <Flame size={14} strokeWidth={3} /> Donate ₹1+
          </button>
          <button onClick={() => onConnect(listing)} className="brut-btn px-4 py-2 bg-white text-xs inline-flex items-center justify-center gap-1">
            🤝 How to connect
          </button>
          <button onClick={() => onShare(listing)} className="brut-btn px-4 py-2 bg-white text-xs inline-flex items-center justify-center gap-1">
            <Share2 size={12} strokeWidth={3} /> Share
          </button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-dashed border-black text-xs font-semibold flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>👑 Self-paid: <b>{money(listing.selfPaid)}</b></span>
        <span>❤️ Donated by fans: <b>{money(listing.donated)}</b></span>
        {listing.rank > 1 && (
          <span className="inline-flex items-center gap-1">
            <ArrowUp size={12} strokeWidth={3} className="text-[#FF5C4D]" />
            <button onClick={() => onInvest(listing, 'SELF_PAY')} className="underline font-bold">pay to overtake #{listing.rank - 1}</button>
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- instagram trending ----------------------------- */
function InstagramTrending({ items, onInvest, onConnect }) {
  const { money } = useMoney();
  if (!items.length) return null;
  return (
    <section id="instagram" className="max-w-7xl mx-auto px-3 sm:px-4 py-12">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 mb-2"><Instagram size={20} strokeWidth={3} /> <Sticker color="#FF5DA2" rotate={-3}><span className="text-white">TRENDING NOW</span></Sticker></div>
          <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">Trending Instagram profiles</h2>
          <p className="text-sm font-semibold mt-1 opacity-80">Instagram IDs competing on money gathered. Pay for your own rank, or donate to your favourite from ₹1.</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(l => (
          <div key={l.id} className="brut p-4 bg-white pop">
            <div className="flex items-center gap-3">
              <div className="font-comic text-3xl">#{l.rank}</div>
              {l.image
                ? <img src={l.image} alt={l.name} className="w-12 h-12 brut object-cover" />
                : <div className="w-12 h-12 brut bg-[#FF5DA2] flex items-center justify-center text-2xl">{l.logo}</div>}
              <div className="min-w-0">
                <div className="font-comic text-xl leading-none truncate">{l.name}</div>
                <div className="text-[11px] font-bold uppercase opacity-70">Instagram</div>
              </div>
            </div>
            <p className="text-sm font-medium mt-3">{l.tagline}</p>
            <div className="mt-3 flex items-center justify-between text-xs font-bold">
              <span>{money(l.raised)} gathered</span>
              <span className="brut px-2 py-1 bg-[#A0F04D]">30% = {money(l.creatorShare)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => onInvest(l, 'SELF_PAY')} className="brut-btn flex-1 py-2 bg-[#FFE156] text-sm">👑 Pay to rank</button>
              <button onClick={() => onInvest(l, 'DONATION')} className="brut-btn flex-1 py-2 bg-[#FF5DA2] text-white text-sm">❤️ Donate</button>
              <button onClick={() => onConnect(l)} className="brut-btn py-2 px-3 bg-white text-sm">🤝</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------- submit ----------------------------- */
function SubmitModal({ open, onClose, categories, onCreated, user, onNeedLogin }) {
  const { money, local, chips, symbol } = useMoney();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ type: 'PRODUCT', name: '', tagline: '', logo: '🚀', website: '', category: 'instagram', contactEmail: '', image: '', network: 'instagram', handle: '' });
  const [kick, setKick] = useState('101');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1); setKick('101');
      setForm({ type: 'PRODUCT', name: '', tagline: '', logo: '🚀', website: '', category: 'instagram', contactEmail: user?.email || '', image: '', network: 'instagram', handle: '' });
    }
  }, [open, user]);

  const submit = async (withKick) => {
    setLoading(true);
    try {
      const d = await api('/listings', { method: 'POST', body: form });
      const listing = d.listing;
      if (withKick) {
        const amount = Math.max(1, Math.floor(Number(kick) || 1));
        const body = { listingId: listing.id, amount, kind: 'SELF_PAY', plan: 'weekly', backerName: user?.name };
        try {
          const cfg = await api('/payments/config');
          if (cfg.provider === 'stripe') {
            const c = await api('/payments/checkout', { method: 'POST', body });
            if (c.url) { toast.success('Listed! Opening secure checkout...'); window.location.assign(c.url); return; }
          }
        } catch (err) { /* fall back to mock below */ }
        const s = await api('/support', { method: 'POST', body });
        toast.success(`🎉 Listed and kicked off at #${s.newRank} in ${form.category}!`);
        onCreated({ ...listing, newRank: s.newRank, investedAmount: amount, raised: s.totalRaised, creatorShare: s.creatorShare, category: form.category });
      } else {
        toast.success('Listed! Now gather funds to climb.');
        onCreated({ ...listing, category: form.category });
      }
      onClose();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const emojis = ['🚀', '📸', '🤖', '💻', '🔥', '⚡', '🎨', '🛠️', '🌟', '💡', '🎯', '💃', '☕', '💪'];

  return (
    <Modal open={open} onClose={onClose} wide title="🚀 List your ID & pay to rank">
      <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase">
        <span className={step >= 1 ? '' : 'opacity-40'}>1. Details</span>
        <ChevronRight size={12} />
        <span className={step >= 2 ? '' : 'opacity-40'}>2. Kickstart funding</span>
      </div>

      {!user && (
        <div className="brut p-3 bg-[#FFE156] mb-4 text-sm font-bold flex items-center justify-between gap-2 flex-wrap">
          <span>Log in first so this listing is yours and you can claim your 30%.</span>
          <button onClick={onNeedLogin} className="brut-btn px-3 py-2 bg-white text-xs">Log in / Register</button>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {['PRODUCT', 'PROFILE'].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} className={`brut-btn flex-1 py-2 ${form.type === t ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
                {t === 'PRODUCT' ? '🚀 App / Product' : '👤 Profile (IG / X)'}
              </button>
            ))}
          </div>
          <ProfilePicker form={form} setForm={setForm} />
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Name or @handle" className="brut w-full p-3 outline-none" />
          <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="One-line pitch (max 80 chars)" maxLength={80} className="brut w-full p-3 outline-none" />
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://instagram.com/yourhandle" className="brut w-full p-3 outline-none" />
          <input value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="Contact email (shown after someone connects)" className="brut w-full p-3 outline-none" />
          <div>
            <div className="text-xs font-bold mb-2">Pick an emoji</div>
            <div className="flex flex-wrap gap-2">
              {emojis.map(e => (
                <button key={e} onClick={() => setForm(f => ({ ...f, logo: e }))} className={`brut w-11 h-11 text-2xl ${form.logo === e ? 'bg-[#FFE156]' : 'is-light bg-white'}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold mb-2">Category</div>
            <div className="flex flex-wrap gap-2">
              {categories.map(c => (
                <button key={c.id} onClick={() => setForm(f => ({ ...f, category: c.id }))} className={`brut-btn px-3 py-2 text-sm ${form.category === c.id ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => { if (!form.name.trim()) return toast.error('Name required'); setStep(2); }} className="brut-btn px-6 py-3 bg-[#FFE156]">Next →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-comic text-3xl">Pay for your rank 👑</h2>
          <p className="text-sm font-semibold">Pay any amount from ₹1 (no cap) to enter the board with a rank right away — or list free and let fans donate you upward.</p>
          <div className="flex flex-wrap gap-2">
            {(chips || [1, 51, 101, 501, 1000]).slice(0, 5).map(v => (
              <button key={v} onClick={() => setKick(String(v))} className={`brut-btn px-3 py-2 text-sm ${String(v) === kick ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>{local(v)}</button>
            ))}
          </div>
          <input type="number" min={1} value={kick} onChange={e => setKick(e.target.value)} className="brut w-full p-3 outline-none font-comic text-2xl" />
          <div className="brut p-3 bg-[#A0F04D] text-sm font-bold">
            You keep 30% of everything gathered (your own payments + fan donations). Pay {local(Math.max(1, Number(kick) || 1))} → your 30% share becomes {local(Math.round(Math.max(1, Number(kick) || 1) * 0.3))}.
          </div>
          <div className="brut p-2 bg-[#4DD4E6] font-bold text-xs text-center">🔒 Secure Stripe checkout (sandbox) — test card 4242 4242 4242 4242</div>
          <div className="flex justify-between flex-wrap gap-2">
            <button onClick={() => setStep(1)} className="brut-btn px-4 py-2 bg-white">← Back</button>
            <div className="flex gap-2">
              <button onClick={() => submit(false)} disabled={loading} className="brut-btn px-4 py-2 bg-white">List free</button>
              <button onClick={() => submit(true)} disabled={loading} className="brut-btn px-6 py-3 bg-[#A0F04D] text-lg">
                {loading ? 'Working...' : '👑 List & pay to rank'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------- rank card ----------------------------- */
function RankCardModal({ open, onClose, listing }) {
  const { money } = useMoney();
  const [pageUrl, setPageUrl] = useState('');
  useEffect(() => { if (typeof window !== 'undefined') setPageUrl(window.location.href); }, [open]);
  if (!listing) return null;
  const shareText = `${listing.name} has gathered ${money(listing.raised)} on Donate & Colab and is #${listing.newRank || listing.rank} in ${listing.category} 🚀 Back them from ₹1!`;
  const copy = () => {
    try { navigator.clipboard.writeText(shareText + '\n' + pageUrl); toast.success('Copied!'); }
    catch (e) { toast.error('Copy failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} title="🎉 Rank card">
      <div className="space-y-4">
        <div className="brut-lg p-6 halftone-yellow -rotate-1">
          <div className="flex items-center gap-3">
            {listing.image
              ? <img src={listing.image} alt={listing.name} className="w-14 h-14 brut object-cover bg-white" />
              : <div className="w-14 h-14 brut bg-white flex items-center justify-center text-3xl">{listing.logo}</div>}
            <div>
              <div className="font-comic text-2xl leading-none">{listing.name}</div>
              <div className="text-xs font-bold uppercase">{listing.category}</div>
            </div>
          </div>
          <div className="mt-4 font-comic text-6xl leading-none">#{listing.newRank || listing.rank}</div>
          <div className="text-sm font-bold mt-1">{money(listing.raised)} gathered • 30% share {money(listing.creatorShare ?? share30(listing.raised))}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Sticker color="#FF5DA2" rotate={-3}><span className="text-white">🔥 RANKED</span></Sticker>
            {listing.investedAmount && <Sticker color="#4DD4E6">{money(listing.investedAmount)} invested</Sticker>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} className="brut-btn py-2 bg-black text-white text-center text-sm">X</a>
          <a target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`} className="brut-btn py-2 bg-[#4DD4E6] text-center text-sm">LinkedIn</a>
          <button onClick={copy} className="brut-btn py-2 bg-white text-sm">Copy</button>
        </div>
      </div>
    </Modal>
  );
}


function MoneySplit({ impact }) {
  const { money } = useMoney();
  const rows = [
    { pct: '30%', title: 'To the creator', desc: 'Listing owners claim 30% of everything gathered to maintain and grow their work.', color: '#A0F04D', value: impact?.creatorPool, emoji: '🎁' },
    { pct: '40%', title: 'To people in need', desc: 'The biggest slice. Goes to families and causes that need help — every payout is published here.', color: '#4DD4E6', value: impact?.charityPool, emoji: '🤲' },
    { pct: '30%', title: 'Servers + developers', desc: 'Hosting, payment fees and the team building this platform.', color: '#B285FF', value: impact?.platformPool, emoji: '⚙️' },
  ];
  return (
    <section id="impact" className="max-w-7xl mx-auto px-3 sm:px-4 py-12">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <div>
          <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">Where every rupee goes</h2>
          <p className="text-sm font-semibold mt-1 opacity-80">Fully public split. No hidden cuts.</p>
        </div>
        <Sticker color="#4DD4E6" rotate={-3}>30 / 40 / 30</Sticker>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {rows.map(r => (
          <div key={r.title} className="brut p-5" style={{ background: r.color }}>
            <div className="flex items-center justify-between">
              <div className="text-4xl">{r.emoji}</div>
              <div className="font-comic text-5xl">{r.pct}</div>
            </div>
            <div className="font-comic text-2xl mt-2">{r.title}</div>
            <div className="text-sm font-semibold mt-1">{r.desc}</div>
            <div className="brut bg-white mt-3 p-2 text-sm font-bold">{money(r.value)} so far</div>
          </div>
        ))}
      </div>
      <div className="brut mt-4 p-5 bg-black text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase text-[#4DD4E6]">Help fund tracker</div>
          <div className="font-comic text-3xl">{money(impact?.charityGiven)} already given away</div>
          <div className="text-sm font-semibold">{money(impact?.charityRemaining)} waiting to be donated to people in need</div>
        </div>
        <div className="text-xs font-semibold max-w-sm">
          {(impact?.recent || []).length === 0
            ? 'No disbursement yet — the first one will be listed right here with the beneficiary name.'
            : (impact.recent.slice(0, 3).map(r => (<div key={r.id}>❤️ {money(r.amount)} → {r.beneficiary}</div>)))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { emoji: '📝', title: 'List your ID', desc: 'Add your Instagram ID, app or startup in 60 seconds.', color: '#FFE156' },
    { emoji: '👑', title: 'Pay for #1', desc: 'Pay any amount yourself — we show exactly what #1 costs.', color: '#FF5DA2' },
    { emoji: '❤️', title: 'Fans donate', desc: 'Anyone can donate from ₹1 (no cap) to push you higher.', color: '#B285FF' },
    { emoji: '🎁', title: '30/40/30 split', desc: 'Creator 30% • people in need 40% • servers & devs 30%.', color: '#A0F04D' },
    { emoji: '🤝', title: 'Connect', desc: 'Log in, register, and connect directly with the creator.', color: '#4DD4E6' },
  ];
  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 py-14">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">How it works</h2>
        <Sticker color="#FF5DA2" rotate={-4}><span className="text-white">₹1 to ∞</span></Sticker>
      </div>
      <div className="grid md:grid-cols-5 gap-4">
        {steps.map((s, i) => (
          <div key={i} className="brut p-5" style={{ background: s.color }}>
            <div className="text-4xl">{s.emoji}</div>
            <div className="font-comic text-2xl mt-2">{i + 1}. {s.title}</div>
            <div className="text-sm font-semibold mt-1">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t-4 border-black bg-black text-white mt-14">
      <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-4 gap-6">
        <div>
          <div className="font-comic text-3xl text-[#FFE156]">Donate &amp; Colab</div>
          <div className="text-sm opacity-80 mt-1">Invest ₹1+. Rank. Connect.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">The 30 / 40 / 30 promise</div>
          <div className="opacity-80">30% back to the creator, 40% to people in need, 30% for servers and developer payouts. <a href="#impact" className="underline">See the tracker</a>.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">Transparency</div>
          <div className="opacity-80">Paid highlights are always tagged SPONSORED. Every rupee shows up in the public counter.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">Platform</div>
          <a href="/dashboard" className="block opacity-80 underline">My dashboard</a>
          <a href="/admin" className="block opacity-80 underline">Admin dashboard</a>
        </div>
      </div>
    </footer>
  );
}

/* ----------------------------- app ----------------------------- */
function App() {
  const { money } = useMoney();
  const { user, login, logout, refresh } = useAuth();
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [trending, setTrending] = useState([]);
  const [impact, setImpact] = useState(null);
  const [category, setCategory] = useState('instagram');
  const [loading, setLoading] = useState(true);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [investTarget, setInvestTarget] = useState(null);
  const [connectTarget, setConnectTarget] = useState(null);
  const [rankCard, setRankCard] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState('');
  const [pending, setPending] = useState(null);

  async function loadAll() {
    try {
      const [c, s, a, t, im] = await Promise.all([
        api('/categories'), api('/stats'), api('/activity'), api('/trending/instagram'), api('/impact'),
      ]);
      setImpact(im);
      setCategories(c.categories || []);
      setStats(s);
      setActivity(a.activity || []);
      setTrending(t.trending || []);
    } catch (e) { /* ignore */ }
  }
  async function loadRankings(cat) {
    setLoading(true);
    try {
      const r = await api(`/rankings?category=${cat}`);
      setRankings(r.rankings || []);
    } catch (e) { setRankings([]); }
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadRankings(category); }, [category]);

  const askLogin = (reason, action) => {
    setAuthReason(reason);
    setPending(action || null);
    setAuthOpen(true);
  };

  const openInvest = (listing, mode = 'DONATION') => {
    if (mode === 'SELF_PAY' && !user) {
      return askLogin('Log in to pay for your rank (so the spend and your 30% share are tracked).', { type: 'invest', listing, mode });
    }
    setInvestTarget({ listing, mode });
  };

  const onAuthed = async (token, u) => {
    login(token, u);
    setAuthOpen(false);
    if (pending?.type === 'connect') setConnectTarget(pending.listing);
    if (pending?.type === 'invest') setInvestTarget({ listing: pending.listing, mode: pending.mode || 'DONATION' });
    if (pending?.type === 'submit') setSubmitOpen(true);
    setPending(null);
    refresh();
  };

  const handleConnect = (listing) => {
    if (!user) return askLogin('Log in or register to connect with this creator.', { type: 'connect', listing });
    setConnectTarget(listing);
  };

  const afterMoney = async (listing) => {
    await loadAll();
    await loadRankings(category);
    setRankCard(listing);
  };

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        onLogin={() => askLogin('Log in to invest, list your work and connect.', null)}
        onLogout={async () => { await logout(); toast.success('Logged out'); }}
        onSubmit={() => (user ? setSubmitOpen(true) : askLogin('Log in to list your app or profile and claim your 30% share.', { type: 'submit' }))}
      />
      <Hero stats={stats} onSubmit={() => (user ? setSubmitOpen(true) : askLogin('Log in to list your app or profile and claim your 30% share.', { type: 'submit' }))} />
      <GatheringStrip stats={stats} />
      <div className="mt-8">
        <ActivityMarquee activity={activity} />
      </div>

      <InstagramTrending items={trending} onInvest={openInvest} onConnect={handleConnect} />

      <section id="leaderboard" className="max-w-7xl mx-auto px-3 sm:px-4 py-10">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={20} strokeWidth={3} /> <Sticker color="#A0F04D">LIVE</Sticker></div>
            <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">The funding leaderboard</h2>
            <p className="text-sm font-semibold mt-1 opacity-80">Ranked by total money gathered — your own payments plus fan donations. Every rupee moves the board.</p>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} strokeWidth={3} />
            <span className="font-semibold text-sm">{stats.viewersOnline || 42} viewing now</span>
          </div>
        </div>
        <CategoryTabs categories={categories} active={category} onChange={setCategory} />
        <div className="mt-5 grid gap-3">
          {loading ? (
            <div className="brut p-10 text-center font-comic text-3xl">Loading the board...</div>
          ) : rankings.length === 0 ? (
            <div className="brut p-10 text-center">
              <div className="font-comic text-3xl">Nothing here yet</div>
              <button onClick={() => setSubmitOpen(true)} className="brut-btn mt-4 px-6 py-3 bg-[#FF5DA2] text-white">Be the first →</button>
            </div>
          ) : (
            rankings.map(l => (
              <ListingCard key={l.id} listing={l} onInvest={openInvest} onConnect={handleConnect} onShare={setRankCard} />
            ))
          )}
        </div>
      </section>

      <MoneySplit impact={impact} />

      <HowItWorks />

      <section className="max-w-7xl mx-auto px-3 sm:px-4 py-8">
        <div className="brut-lg p-4 sm:p-8 halftone-yellow flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-comic text-2xl sm:text-3xl md:text-4xl">Total gathering: {money(stats.totalRaised)}</h3>
            <p className="font-semibold mt-1">You keep 30% of your listing&apos;s gathering, 40% helps people in need ({money(stats.charityPool)} in the fund) and 30% runs the platform.</p>
          </div>
          <button onClick={() => (user ? setSubmitOpen(true) : askLogin('Log in to list and start gathering.', { type: 'submit' }))}
            className="brut-btn px-6 py-3 bg-[#FF5DA2] text-white text-lg">Start gathering →</button>
        </div>
      </section>

      <Footer />

      <SubmitModal open={submitOpen} onClose={() => setSubmitOpen(false)} categories={categories} user={user}
        onNeedLogin={() => { setSubmitOpen(false); askLogin('Log in to own this listing.', { type: 'submit' }); }}
        onCreated={async (l) => { if (l.category) setCategory(l.category); await loadAll(); await loadRankings(l.category || category); if (l.newRank) setRankCard(l); }} />
      <InvestModal open={!!investTarget} onClose={() => setInvestTarget(null)} listing={investTarget?.listing} mode={investTarget?.mode} user={user} onDone={afterMoney} />
      <ConnectModal open={!!connectTarget} onClose={() => setConnectTarget(null)} listing={connectTarget}
        onNeedLogin={(l) => askLogin('Log in or register to connect.', { type: 'connect', listing: l })} />
      <RankCardModal open={!!rankCard} onClose={() => setRankCard(null)} listing={rankCard} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={onAuthed} reason={authReason} />
    </div>
  );
}

export default App;
