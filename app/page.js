'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Trophy, Zap, Share2, TrendingUp, Flame, Crown, ArrowUp,
  Users, ChevronRight, LogOut, LayoutDashboard, Shield, Instagram, Swords, Eye, MousePointerClick, Search
} from 'lucide-react';
import { Modal, Sticker, StatBox, TalkCloud } from '@/components/brut';
import AuthModal from '@/components/AuthModal';
import InvestModal from '@/components/InvestModal';
import ProfilePicker from '@/components/ProfilePicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, compact, useAuth } from '@/lib/client';
import { useMoney } from '@/lib/currency';

const COLORS = ['#FFE156', '#FF5DA2', '#4DD4E6', '#FF5C4D', '#A0F04D', '#B285FF', '#FFB84D'];
const PLATFORMS = [
  { id: 'instagram', label: '📸 Instagram', enabled: true },
  { id: 'startup', label: '🚀 Startup', enabled: true },
  { id: 'product', label: '🛍 Product', enabled: true },
  { id: 'x', label: '𝕏 X', enabled: false },
  { id: 'youtube', label: '▶️ YouTube', enabled: false },
  { id: 'linkedin', label: '💼 LinkedIn', enabled: false },
];
const PROFILE_CATS = [
  { id: 'creators', name: 'Creator', emoji: '🎨' },
  { id: 'businesses', name: 'Business', emoji: '🏢' },
  { id: 'artists', name: 'Artist', emoji: '🎵' },
  { id: 'instagram', name: 'Influencer', emoji: '📸' },
  { id: 'startups', name: 'Brand', emoji: '🚀' },
  { id: 'products', name: 'Other', emoji: '🛍' },
];
const viewed = new Set();

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
          <div className="w-11 h-11 bg-black text-[#FFE156] flex items-center justify-center font-comic text-2xl" style={{ borderWidth: 3 }}>PTT</div>
          <div>
            <div className="font-comic text-2xl leading-none">Pay To Trend</div>
            <div className="text-[11px] font-semibold tracking-wider uppercase">Add profile • Pay to rank • Fans can boost</div>
          </div>
        </a>
        <div className="flex items-center gap-2">
          <CurrencySwitcher />
          {!user && (
            <>
              <a href="#leaderboard" className="hidden lg:inline-block brut-btn px-3 py-2 bg-white text-sm">📸 Instagram</a>
              <a href="#leaderboard" className="hidden lg:inline-block brut-btn px-3 py-2 bg-white text-sm">🔥 Trending</a>
              <a href="#leaderboard" className="hidden md:inline-block brut-btn px-3 py-2 bg-white text-sm">🏆 Rankings</a>
              <a href="#how" className="hidden lg:inline-block brut-btn px-3 py-2 bg-white text-sm">❓ How It Works</a>
            </>
          )}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="brut-btn px-2 py-1 bg-white text-sm inline-flex items-center gap-2 outline-none">
                  {user.image ? (
                    <img src={user.image} alt={user.name || 'User'} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#FFE156] border border-black flex items-center justify-center font-bold">
                      {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-bold hidden sm:inline truncate max-w-[100px]">{user.name || user.email}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 brut bg-white p-2 text-sm font-bold border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                <DropdownMenuItem asChild className="cursor-pointer outline-none">
                  <a href="#leaderboard" className="flex items-center gap-2 p-2 w-full hover:bg-[#FFE156]">
                    📸 Instagram
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer outline-none">
                  <a href="#leaderboard" className="flex items-center gap-2 p-2 w-full hover:bg-[#FFE156]">
                    🔥 Trending
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer outline-none">
                  <a href="#leaderboard" className="flex items-center gap-2 p-2 w-full hover:bg-[#FFE156]">
                    🏆 Rankings
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer outline-none">
                  <a href="#how" className="flex items-center gap-2 p-2 w-full hover:bg-[#FFE156]">
                    ❓ How It Works
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 border-t-2 border-black" />
                <DropdownMenuItem asChild className="cursor-pointer outline-none">
                  <a href="/dashboard" className="flex items-center gap-2 p-2 w-full hover:bg-[#FFE156]">
                    <LayoutDashboard size={14} strokeWidth={3} /> My Stats
                  </a>
                </DropdownMenuItem>
                {user.role === 'admin' && (
                  <DropdownMenuItem asChild className="cursor-pointer outline-none">
                    <a href="/admin" className="flex items-center gap-2 p-2 w-full hover:bg-black hover:text-[#FFE156]">
                      <Shield size={14} strokeWidth={3} /> Admin
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator className="my-1 border-t-2 border-black" />
                <DropdownMenuItem onClick={onLogout} className="cursor-pointer outline-none flex items-center gap-2 p-2 w-full text-red-600 hover:bg-red-100">
                  <LogOut size={14} strokeWidth={3} /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button onClick={onLogin} className="brut-btn px-4 py-2 bg-white text-sm font-bold">Log in</button>
          )}
          <button onClick={onSubmit} className="brut-btn px-4 py-2 bg-[#FF5DA2] text-white text-sm inline-flex items-center gap-1">
            <Flame size={16} strokeWidth={3} /> Add your profile
          </button>
        </div>
      </div>
    </header>
  );
}

function LiveBattleCard({ one, two, onBoost, onCompete }) {
  const { money } = useMoney();
  if (!one) {
    return (
      <div className="brut-lg bg-black text-white p-4 sm:p-6 md:-rotate-1">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#FFE156]">
          <span className="live-dot" /> 🔥 ALWAYS LIVE
        </div>
        <div className="font-comic text-4xl mt-3">NO ONE IS #1 YET</div>
        <p className="text-sm font-bold mt-2 opacity-80">Add your profile, then pay to take #1. No end date.</p>
        <button onClick={() => onCompete(null)} className="brut-btn mt-4 w-full py-3 bg-[#FF5DA2] text-white text-lg">🔥 PAY TO TAKE #1</button>
      </div>
    );
  }
  const gap = Math.max(0, (one.score || one.raised || 0) - (two?.score || two?.raised || 0));
  return (
    <div className="brut-lg bg-black text-white p-4 sm:p-6 md:-rotate-1 attack-flash">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#FFE156]">
          <span className="live-dot" /> 🔥 CURRENT #1 — ALWAYS LIVE
        </div>
        <div className="mt-3 text-[11px] font-bold uppercase opacity-70">Holding #1</div>
      <div className="flex items-center gap-3 mt-1">
        {one.image
          ? <img src={one.image} alt={one.name} className="w-12 h-12 brut object-cover bg-white" />
          : <div className="w-12 h-12 brut bg-[#FFE156] text-black flex items-center justify-center text-2xl">{one.logo}</div>}
        <div className="min-w-0">
          <div className="font-comic text-3xl leading-none break-all">{one.name}</div>
          <div className="text-xs font-bold">{compact(one.views)} views</div>
        </div>
      </div>
      <div className="font-comic text-4xl sm:text-5xl md:text-6xl text-[#FFE156] leading-none mt-3 break-words">{money(one.raised)}</div>
      <div className="brut mt-4 p-3 bg-[#FFE156] text-black">
        <div className="text-[11px] font-bold uppercase">This board never ends</div>
        <div className="font-comic text-3xl leading-tight">PAY MORE TO STAY #1</div>
      </div>
      {two && (
        <div className="brut mt-3 p-3 bg-[#FF5C4D] text-white text-sm font-bold">
          ⚠️ #2 {two.name} IS ONLY {money(gap || two.toTakeOne || 100)} AWAY
        </div>
      )}
      <button onClick={() => onBoost(one)} className="brut-btn mt-4 w-full py-3 bg-[#FF5DA2] text-white text-lg inline-flex items-center justify-center gap-2">
        <Flame size={18} strokeWidth={3} /> PAY TO MAKE THEM #1
      </button>
      <button onClick={() => onCompete(one)} className="brut-btn mt-2 w-full py-2 bg-white text-black text-sm inline-flex items-center justify-center gap-2">
        <Swords size={16} strokeWidth={3} /> Take #1 with my profile
      </button>
    </div>
  );
}

function Hero({ stats, one, two, onSubmit, onBoost, onCompete }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  return (
    <section className="relative overflow-hidden border-b-4 border-black">
      <div className="absolute inset-0 halftone opacity-30" />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-8 md:py-16 relative">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 items-center">
          <div>
            <div className="flex flex-wrap gap-2 mb-5">
              <Sticker color="#FF5DA2" rotate={-4}><span className="text-white">🔥 ALWAYS LIVE</span></Sticker>
              <Sticker color="#A0F04D" rotate={3}>NO END DATE</Sticker>
              <Sticker color="#4DD4E6" rotate={-2}>ADD • PAY • FANS CAN BOOST</Sticker>
            </div>
            <h1 className="font-comic text-4xl sm:text-5xl md:text-7xl leading-[0.95] md:leading-[0.92] tracking-wide break-words">
              ADD YOUR INSTAGRAM.<br />
              PAY TO HIT <span className="bg-[#FF5DA2] text-white px-3 inline-block -rotate-1">#1</span>.<br />
              <span className="bg-black text-[#FFE156] px-3 inline-block rotate-1">NEVER ENDS.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl max-w-xl font-medium">
              Add your Instagram (or other) profile, then pay to rank it higher. There is no contest deadline — whoever has more money paid toward them stays on top. Fans can search a profile and donate to push them up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onSubmit} className="brut-btn px-6 py-3 bg-[#FF5DA2] text-white text-lg inline-flex items-center gap-2">
                <Flame size={20} strokeWidth={3} /> Add your profile
              </button>
              <a href="#leaderboard" className="brut-btn px-6 py-3 bg-[#A0F04D] text-lg inline-flex items-center gap-2">
                <Trophy size={20} strokeWidth={3} /> Search &amp; donate
              </a>
              <a href="#how" className="brut-btn px-6 py-3 bg-white text-lg">How It Works</a>
            </div>
          </div>
          <LiveBattleCard one={one} two={two} onBoost={onBoost} onCompete={onCompete} />
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
        <StatBox color="#FFE156" label="Total paid" value={money(stats.totalRaised)} sub="all money on the board" />
        <StatBox color="#A0F04D" label="Profiles listed" value={stats.activeProfiles || stats.totalListings || 0} sub="always competing" />
        <StatBox color="#4DD4E6" label="Profile views" value={compact(stats.totalViews)} sub="visibility on this site" />
        <StatBox color="#B285FF" label="Profile clicks" value={compact(stats.totalClicks)} sub="people who opened Instagram" />
        <StatBox color="#FF5DA2" label="Always live" value="∞" sub="no contest end date" />
      </div>
    </section>
  );
}

function activityText(e, money) {
  if (e.eventType === 'FAN' || e.kind === 'FAN') return `💖 Fans paid to boost ${e.listingName} — ${money(e.amount)}`;
  if (e.eventType === 'TOOK_RANK' || e.eventType === 'SELF_PAY') return `🔥 ${e.listingName} just took a rank — ${money(e.amount)}`;
  if (e.eventType === 'DEFENDED') return `🛡️ ${e.listingName} defended their position`;
  if (e.eventType === 'ENTERED') return `🔥 ${e.listingName} entered the leaderboard`;
  if (e.eventType === 'SOCIAL_CLICK') return `📈 ${e.listingName} got a new Instagram click`;
  if (e.eventType === 'LOST_RANK') return `⚠️ ${e.listingName} lost #1`;
  return `⚡ ${e.listingName || e.backerName} moved on the board`;
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
            {activityText(e, money)}
          </span>
        ))}
      </div>
    </div>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <div className="brut mb-4 p-2 bg-white flex items-center gap-2">
      <Search size={18} strokeWidth={3} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search a profile to donate — @handle or name"
        className="flex-1 outline-none font-bold py-2 bg-transparent"
        aria-label="Search profiles"
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} className="text-xs font-bold underline px-2">Clear</button>
      ) : null}
    </div>
  );
}

function CategoryTabs({ categories, active, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      <button onClick={() => onChange('all')}
        className={`brut-btn px-4 py-2 whitespace-nowrap ${active === 'all' ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
        🔥 All
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
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const bg = rank === 1 ? '#FFE156' : rank === 2 ? '#4DD4E6' : rank === 3 ? '#FF5DA2' : '#fff';
  return (
    <div className="brut inline-flex items-center gap-1 px-3 py-2 font-comic text-2xl" style={{ background: bg, boxShadow: '4px 4px 0 #000' }}>
      {medal ? <span>{medal}</span> : <Crown size={16} strokeWidth={3} />} #{rank}
    </div>
  );
}

function statusChip(listing) {
  if (listing.rank === 1) return { text: '🔥 HOLDING #1', color: '#FF5DA2', fg: '#fff' };
  if (listing.toTakeOne && listing.toTakeOne <= 300) return { text: `⚡ ${listing.toTakeOne ? '' : ''}₹ TO #1`, color: '#FFE156', fg: '#000', amount: listing.toTakeOne };
  if (listing.rank <= 3) return { text: '🔥 TRENDING NOW', color: '#A0F04D', fg: '#000' };
  return { text: '📌 ON THE BOARD', color: '#B285FF', fg: '#000' };
}

function ListingCard({ listing, mine, onBoost, onCompete, onShare }) {
  const { money } = useMoney();
  const color = COLORS[(listing.rank - 1) % COLORS.length];
  const isTop3 = listing.rank <= 3;
  const chip = statusChip(listing);
  useEffect(() => {
    if (viewed.has(listing.id)) return;
    viewed.add(listing.id);
    api(`/listings/${listing.id}/view`, { method: 'POST' }).catch(() => {});
  }, [listing.id]);
  const visit = async () => {
    try { await api(`/listings/${listing.id}/click`, { method: 'POST' }); } catch (e) {}
    const href = listing.website || (listing.handle ? `https://instagram.com/${listing.handle}` : '');
    if (href) window.open(href, '_blank', 'noreferrer');
  };

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
            {listing.verified && <Sticker color="#A0F04D" rotate={2}>✓ VERIFIED</Sticker>}
          </div>
          <p className="text-sm font-medium mt-1 opacity-90">{listing.displayName && listing.displayName !== listing.name ? listing.displayName + ' · ' : ''}{listing.tagline}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="brut px-2 py-1 bg-white">{money(listing.raised)}</span>
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1"><Eye size={11} strokeWidth={3} /> {compact(listing.views)} views</span>
            <span className="brut px-2 py-1 bg-white inline-flex items-center gap-1"><MousePointerClick size={11} strokeWidth={3} /> {compact(listing.clicks)} Instagram clicks</span>
            <span className="brut px-2 py-1" style={{ background: chip.color, color: chip.fg }}>
              {chip.amount ? `⚡ ${money(chip.amount)} TO #1` : chip.text}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 w-full md:w-auto">
          <button onClick={() => onBoost(listing)} className="brut-btn px-4 py-3 bg-[#FF5DA2] text-white text-sm inline-flex items-center justify-center gap-1">
            <Flame size={14} strokeWidth={3} /> {mine ? `PAY TO RANK UP` : `DONATE TO RANK THEM UP`}
          </button>
          {!mine && (
            <button onClick={() => onCompete(listing)} className="brut-btn px-4 py-2 bg-white text-sm inline-flex items-center justify-center gap-1">
              <Swords size={14} strokeWidth={3} /> Take this rank with my profile
            </button>
          )}
          <button onClick={visit} className="brut-btn px-4 py-2 bg-white text-sm inline-flex items-center justify-center gap-1">
            <Instagram size={14} strokeWidth={3} /> Visit Instagram
          </button>
          <button onClick={() => onShare(listing)} className="brut-btn px-4 py-2 bg-white text-xs inline-flex items-center justify-center gap-1">
            <Share2 size={12} strokeWidth={3} /> Share
          </button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t-2 border-dashed border-black text-xs font-semibold flex flex-wrap items-center gap-x-4 gap-y-1">
        {listing.rank === 1 ? (
          <span className="inline-flex items-center gap-1 font-bold">
            🔥 HOLDING #1
            {listing.leadOverNext > 0 && <span> · ⚠️ #{2} is {money(listing.leadOverNext)} behind</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <ArrowUp size={12} strokeWidth={3} className="text-[#FF5C4D]" />
            <button onClick={() => onBoost(listing)} className="underline font-bold">
              ⚠️ {money(listing.toTakeOne || listing.toTakeThis)} TO PAY THEM TO #1
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

function SubmitModal({ open, onClose, categories, onCreated, user, onNeedLogin, challenge, onPay }) {
  const { money } = useMoney();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ type: 'PROFILE', name: '', tagline: '', logo: '🔥', website: '', category: 'instagram', contactEmail: '', image: '', network: 'instagram', handle: '', displayName: '' });
  const [targetRank, setTargetRank] = useState(1);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [created, setCreated] = useState(null);

  const loadQuote = async (listingId, cat, rank) => {
    try {
      const q = await api(`/challenge/quote?category=${cat || form.category}&targetRank=${rank || targetRank}${listingId ? `&listingId=${listingId}` : ''}`);
      setQuote(q);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (open) {
      setStep(1);
      setCreated(null);
      setTargetRank(challenge?.rank || 1);
      setForm({
        type: 'PROFILE', name: '', tagline: '', logo: '🔥', website: '',
        category: challenge?.category || 'instagram', contactEmail: user?.email || '',
        image: '', network: 'instagram', handle: '', displayName: '',
      });
      loadQuote(null, challenge?.category || 'instagram', challenge?.rank || 1);
    }
  }, [open, user, challenge]);

  const createListing = async () => {
    if (!user) return onNeedLogin();
    if (!form.name.trim()) return toast.error('Profile name required');
    setLoading(true);
    try {
      const d = await api('/listings', { method: 'POST', body: { ...form, listFree: true } });
      setCreated(d.listing);
      if (d.quote) setQuote(d.quote);
      else await loadQuote(d.listing.id, form.category, targetRank);
      setStep(5);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  const goPay = () => {
    const listing = created;
    if (!listing) return;
    onClose();
    onPay(listing, targetRank);
  };

  return (
    <Modal open={open} onClose={onClose} wide title="🔥 Start Trending">
      {user && (
        <div className="mb-4 flex items-center gap-1 text-[11px] font-bold uppercase overflow-x-auto">
          {['Platform', 'Profile', 'Category', 'Rank', 'Pay'].map((l, i) => (
            <span key={l} className="inline-flex items-center gap-1 flex-shrink-0">
              {i > 0 && <ChevronRight size={12} />}
              <span className={step >= i + 1 ? '' : 'opacity-40'}>{i + 1}. {l}</span>
            </span>
          ))}
        </div>
      )}

      {!user ? (
        <div className="brut p-5 bg-[#FFE156] text-center space-y-3">
          <div className="font-comic text-3xl">Log in to compete</div>
          <p className="text-sm font-bold">You need an account before you can list a profile and fight for #1.</p>
          <button onClick={onNeedLogin} className="brut-btn px-6 py-3 bg-black text-[#FFE156] text-lg">Log in / Register</button>
        </div>
      ) : step === 1 ? (
        <div className="space-y-4">
          <h2 className="font-comic text-3xl">Choose your platform</h2>
          <div className="grid grid-cols-2 gap-3">
            {PLATFORMS.map(p => (
              <button key={p.id} disabled={!p.enabled}
                onClick={() => { 
                  let defaultCat = 'instagram';
                  if (p.id === 'startup') defaultCat = 'startups';
                  if (p.id === 'product') defaultCat = 'products';
                  setForm(f => ({ ...f, network: p.id, category: defaultCat })); 
                  setStep(2); 
                }}
                className={`brut-btn py-4 text-lg ${p.enabled ? 'bg-[#FFE156]' : 'bg-white opacity-50 cursor-not-allowed'}`}>
                {p.label}{!p.enabled && <div className="text-[10px] font-bold">COMING SOON</div>}
              </button>
            ))}
          </div>
        </div>
      ) : step === 2 ? (
        <div className="space-y-4">
          <h2 className="font-comic text-3xl">Enter your profile</h2>
          <input
            value={form.website}
            onChange={e => {
              const v = e.target.value;
              const h = v.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/\/.*$/, '');
              setForm(f => ({ ...f, website: v, handle: h, name: f.name || (h ? '@' + h : '') }));
            }}
            placeholder={form.network === 'instagram' ? "https://instagram.com/username" : "Website URL"}
            className="brut w-full p-3 outline-none"
          />
          <ProfilePicker form={form} setForm={setForm} />
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={form.network === 'startup' ? "Startup Name" : form.network === 'product' ? "Product Name" : "@username"} className="brut w-full p-3 outline-none" />
          <input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} placeholder="Display name" className="brut w-full p-3 outline-none" />
          <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="One-line bio (max 80 chars)" maxLength={80} className="brut w-full p-3 outline-none" />
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="brut-btn px-4 py-2 bg-white">← Back</button>
            <button onClick={() => { if (!form.name.trim()) return toast.error('Name required'); setStep(3); }} className="brut-btn px-6 py-3 bg-[#FFE156]">Continue →</button>
          </div>
        </div>
      ) : step === 3 ? (
        <div className="space-y-4">
          <h2 className="font-comic text-3xl">Choose your category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PROFILE_CATS.map(c => (
              <button key={c.id} onClick={() => { setForm(f => ({ ...f, category: c.id })); loadQuote(created?.id, c.id, targetRank); }}
                className={`brut-btn py-3 ${form.category === c.id ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="brut-btn px-4 py-2 bg-white">← Back</button>
            <button onClick={() => { setStep(4); loadQuote(created?.id, form.category, targetRank); }} className="brut-btn px-6 py-3 bg-[#FFE156]">Continue →</button>
          </div>
        </div>
      ) : step === 4 ? (
        <div className="space-y-4">
          <h2 className="font-comic text-3xl">Choose your target</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="brut p-4 bg-[#FFE156]">
              <div className="text-[11px] font-bold uppercase">Current #1</div>
              <div className="font-comic text-2xl">{quote?.top5?.[0]?.name || 'Open'}</div>
              <div className="font-comic text-3xl">{money(quote?.top5?.[0]?.amount || 0)}</div>
            </div>
            <div className="brut p-4 bg-[#4DD4E6]">
              <div className="text-[11px] font-bold uppercase">Current #5</div>
              <div className="font-comic text-2xl">{quote?.top5?.[4]?.name || 'Open'}</div>
              <div className="font-comic text-3xl">{money(quote?.top5?.[4]?.amount || 0)}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => { setTargetRank(n); loadQuote(created?.id, form.category, n); }}
                className={`brut-btn px-4 py-3 ${targetRank === n ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>
                #{n}
              </button>
            ))}
          </div>
          {quote && (
            <div className="brut p-3 bg-black text-white text-sm font-bold">
              To take #{targetRank}: <span className="text-[#FFE156]">{money(quote.minBid)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="brut-btn px-4 py-2 bg-white">← Back</button>
            <button onClick={createListing} disabled={loading} className="brut-btn px-6 py-3 bg-[#A0F04D] text-lg">
              {loading ? 'Listing...' : 'Continue to payment →'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="brut p-4 bg-[#A0F04D]">
            <div className="font-comic text-3xl">You&apos;re listed</div>
            <p className="text-sm font-bold mt-1">{created?.name} is on the board. Pay to take #{targetRank} — the ranking never ends.</p>
          </div>
          {quote && (
            <div className="brut p-4 bg-white space-y-1 text-sm font-bold">
              <div className="flex justify-between"><span>Current #{targetRank}</span><span>{money(quote.currentAmount)}</span></div>
              <div className="flex justify-between"><span>Your required amount</span><span>{money(quote.minBid)}</span></div>
              <div className="flex justify-between font-comic text-2xl pt-2 border-t-2 border-black"><span>Total</span><span>{money(quote.minBid)}</span></div>
            </div>
          )}
          <button onClick={goPay} className="brut-btn w-full py-3 bg-[#FF5DA2] text-white text-lg">
            🔥 TAKE #{targetRank}
          </button>
        </div>
      )}
    </Modal>
  );
}

function RankCardModal({ open, onClose, listing, onAddMoney }) {
  const { money } = useMoney();
  const [pageUrl, setPageUrl] = useState('');
  useEffect(() => { if (typeof window !== 'undefined') setPageUrl(window.location.href); }, [open]);
  if (!listing) return null;
  const rank = listing.newRank || listing.rank;
  const shareText = `${listing.name} is #${rank} on PayToTrend. Search them and donate to push them higher — the board never ends.`;
  const copy = () => {
    try { navigator.clipboard.writeText(shareText + '\n' + pageUrl); toast.success('Copied!'); }
    catch (e) { toast.error('Copy failed'); }
  };
  return (
    <Modal open={open} onClose={onClose} title={rank === 1 ? '🏆 YOU ARE #1' : '🎉 Rank card'}>
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
          <div className="mt-4 font-comic text-6xl leading-none">#{rank}</div>
          <div className="text-sm font-bold mt-1">{money(listing.raised)} on the board · {compact(listing.views)} PayToTrend views</div>
          {listing.movedUp > 0 && <p className="text-sm font-bold mt-3">📈 YOU MOVED UP {listing.movedUp} POSITIONS</p>}
        </div>
        {onAddMoney && (
          <button onClick={() => { onClose(); onAddMoney(listing); }} className="brut-btn w-full py-3 bg-[#FF5DA2] text-white text-lg">
            🔥 Climb from #{rank}
          </button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <a target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} className="brut-btn py-2 bg-black text-white text-center text-sm">X</a>
          <a target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`} className="brut-btn py-2 bg-[#4DD4E6] text-center text-sm">LinkedIn</a>
          <button onClick={copy} className="brut-btn py-2 bg-white text-sm">Copy</button>
        </div>
      </div>
    </Modal>
  );
}

function OvertakenModal({ note, onClose, onDefend }) {
  const { money } = useMoney();
  if (!note) return null;
  return (
    <Modal open={!!note} onClose={onClose} title="🚨 YOU JUST LOST #1">
      <div className="space-y-4">
        <div className="brut p-4 bg-[#FF5C4D] text-white">
          <div className="font-comic text-3xl">⚠️ YOU&apos;VE BEEN OVERTAKEN</div>
          <p className="text-sm font-bold mt-2">{note.challengerName} just took #1. You are now #{note.toRank}.</p>
        </div>
        <div className="brut p-4 bg-white space-y-1 text-sm font-bold">
          <div className="flex justify-between"><span>Current #1</span><span>{money(note.currentAmount)}</span></div>
          <div className="flex justify-between"><span>Defend #1</span><span>{money(note.defendTotal || note.defendAmount)}</span></div>
        </div>
        <button onClick={onDefend} className="brut-btn w-full py-3 bg-[#FF5DA2] text-white text-lg">🔥 DEFEND #1</button>
      </div>
    </Modal>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'ADD PROFILE', desc: 'Add your Instagram (or other) profile.', color: '#FFE156' },
    { n: '02', title: 'PAY TO RANK', desc: 'Pay to climb. More money paid toward you = a higher rank.', color: '#FF5DA2' },
    { n: '03', title: 'FANS SEARCH', desc: 'Fans search your profile and donate to push you up.', color: '#4DD4E6' },
    { n: '04', title: 'STAY ON TOP', desc: 'Whoever has more paid toward them holds the higher spot.', color: '#A0F04D' },
    { n: '05', title: 'NEVER ENDS', desc: 'There is no contest deadline. Rank is always live.', color: '#B285FF' },
  ];
  return (
    <section id="how" className="max-w-7xl mx-auto px-3 sm:px-4 py-14">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">How ranking works</h2>
        <Sticker color="#FF5DA2" rotate={-4}><span className="text-white">ADD → PAY → FANS DONATE → NEVER ENDS</span></Sticker>
      </div>
      <div className="grid md:grid-cols-5 gap-4">
        {steps.map(s => (
          <div key={s.n} className="brut p-5" style={{ background: s.color }}>
            <div className="text-xs font-bold opacity-70">{s.n}</div>
            <div className="font-comic text-2xl mt-1">{s.title}</div>
            <div className="text-sm font-semibold mt-1">{s.desc}</div>
          </div>
        ))}
      </div>
      <div className="brut mt-6 p-4 bg-black text-[#FFE156] text-center font-comic text-2xl sm:text-3xl tracking-wide">
        ADD PROFILE ↓ PAY TO RANK ↓ FANS DONATE ↓ STAY ON TOP ↓ NEVER ENDS
      </div>
    </section>
  );
}

function PayingFor() {
  const cards = [
    { emoji: '👁', title: 'VISIBILITY', desc: 'Your profile appears on a public competitive leaderboard.', color: '#FFE156' },
    { emoji: '🔥', title: 'POSITION', desc: 'Higher positions give your profile more prominent placement.', color: '#FF5DA2' },
    { emoji: '📈', title: 'DISCOVERY', desc: 'Visitors can discover and click through to your social profile.', color: '#4DD4E6' },
  ];
  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 py-12">
      <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl mb-6">What you&apos;re paying for</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map(c => (
          <div key={c.title} className="brut p-5" style={{ background: c.color }}>
            <div className="text-4xl">{c.emoji}</div>
            <div className="font-comic text-2xl mt-2">{c.title}</div>
            <div className="text-sm font-semibold mt-1">{c.desc}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs font-semibold opacity-80 max-w-3xl">
        PayToTrend provides visibility on PayToTrend. We do not guarantee Instagram followers, likes, engagement, or algorithmic ranking.
        PayToTrend sells promotional visibility on PayToTrend. It does not sell followers, likes, comments, or guaranteed engagement.
      </p>
    </section>
  );
}

function HallOfFame({ hall }) {
  const { money } = useMoney();
  if (!hall?.length) return null;
  return (
    <section className="max-w-7xl mx-auto px-3 sm:px-4 py-12">
      <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl mb-5">Hall of Fame</h2>
      <div className="grid md:grid-cols-2 gap-4">
        {hall.slice(0, 4).map(h => (
          <div key={h.id} className="brut p-5 bg-white">
            <div className="text-[11px] font-bold uppercase opacity-70">🏆 Weekly winners</div>
            <div className="text-xs font-semibold mb-3">{h.periodEnd ? new Date(h.periodEnd).toLocaleDateString() : ''}</div>
            {(h.winners || []).map(w => (
              <div key={w.listingId || w.rank} className="flex justify-between border-b-2 border-dashed border-black py-2 text-sm font-bold">
                <span>{w.rank === 1 ? '🥇' : w.rank === 2 ? '🥈' : '🥉'} {w.name}</span>
                <span>{money(w.amount)}</span>
              </div>
            ))}
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
          <div className="font-comic text-3xl text-[#FFE156]">Pay To Trend</div>
          <div className="text-sm opacity-80 mt-1">Add a profile. Pay to rank. Fans can boost. Never ends.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">The loop</div>
          <div className="opacity-80">Add profile → Pay to rank → Fans search and donate → Stay on top.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">Honest visibility</div>
          <div className="opacity-80">We sell placement on PayToTrend. Not followers, likes, or guaranteed engagement.</div>
        </div>
        <div className="text-sm space-y-1">
          <div className="font-bold uppercase text-xs">Platform</div>
          <a href="/dashboard" className="block opacity-80 underline">My stats</a>
          <a href="/admin" className="block opacity-80 underline">Admin</a>
        </div>
      </div>
    </footer>
  );
}

function competitiveBanner(rankings, money) {
  const one = rankings[0];
  const two = rankings[1];
  if (!one) return '🔥 NO PROFILES YET — ADD YOURS AND PAY TO TAKE #1';
  if (two && (one.leadOverNext || 0) <= 200) return `⚡ ONLY ${money(one.leadOverNext || two.toTakeOne)} TO TAKE #1`;
  if (one.rank === 1) return `🔥 #1 ${one.name} — PAY MORE TO OVERTAKE`;
  return '💸 PAY MORE TO CLIMB. FANS CAN DONATE TOO.';
}

function App() {
  const { money } = useMoney();
  const { user, login, logout, refresh } = useAuth();
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [category, setCategory] = useState('instagram');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [investTarget, setInvestTarget] = useState(null);
  const [rankCard, setRankCard] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState('');
  const [pending, setPending] = useState(null);
  const [overtaken, setOvertaken] = useState(null);
  const [myListings, setMyListings] = useState([]);

  async function loadAll() {
    try {
      const [c, s, a] = await Promise.all([
        api('/categories'), api('/stats'), api('/activity'),
      ]);
      setCategories(c.categories || []);
      setStats(s);
      setActivity(a.activity || []);
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
  useEffect(() => {
    const t = setInterval(() => { loadAll(); loadRankings(category); }, 12000);
    return () => clearInterval(t);
  }, [category]);
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const d = await api(`/search?q=${encodeURIComponent(q)}`);
        setResults(d.listings || []);
      } catch (e) { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!user) return;
    api('/me/listings').then(d => setMyListings(d.listings || [])).catch(() => {});
    api('/me/notifications').then(d => {
      const unread = (d.notifications || []).find(n => !n.read && n.type === 'OVERTAKEN');
      if (unread) setOvertaken(unread);
    }).catch(() => {});
  }, [user]);

  const askLogin = (reason, action) => {
    setAuthReason(reason);
    setPending(action || null);
    setAuthOpen(true);
  };

  const openList = (holder = null, authedUser) => {
    const u = authedUser || user;
    if (!u) return askLogin('Log in to start trending and fight for #1.', { type: 'submit', holder });
    setChallenge(holder);
    setSubmitOpen(true);
  };

  const mineIn = (cat) => myListings.find(l => l.category === cat);

  const openBoost = (listing, authedUser) => {
    if (!listing) return openList(null, authedUser);
    const u = authedUser || user;
    if (!u) return askLogin('Log in to pay and push this profile to #1.', { type: 'boost', listing });
    const mine = u.id && listing.ownerId === u.id;
    setInvestTarget({ listing, targetRank: 1, mode: mine ? 'SELF_PAY' : 'FAN' });
  };

  const openCompete = (holder, authedUser) => {
    const u = authedUser || user;
    if (!u) return askLogin('Log in to take this rank with your own profile.', { type: 'take', holder });
    if (!holder) return openList(null, u);
    const cat = holder?.category || category;
    const mine = mineIn(cat);
    if (mine) {
      setInvestTarget({ listing: mine, targetRank: holder?.rank || 1, mode: 'SELF_PAY' });
      return;
    }
    setChallenge(holder);
    setSubmitOpen(true);
  };

  const onAuthed = async (token, u) => {
    login(token, u);
    setAuthOpen(false);
    if (pending?.type === 'boost') openBoost(pending.listing, u);
    if (pending?.type === 'take') openCompete(pending.holder, u);
    if (pending?.type === 'submit') openList(pending.holder || null, u);
    setPending(null);
    refresh();
  };

  const afterMoney = async (listing) => {
    await loadAll();
    await loadRankings(category);
    setRankCard(listing);
  };

  const shown = results !== null ? results : rankings;
  const one = rankings[0];
  const two = rankings[1];

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        onLogin={() => askLogin('Log in to compete, climb and defend your rank.', null)}
        onLogout={async () => { await logout(); toast.success('Logged out'); }}
        onSubmit={() => openList(null)}
      />
      <Hero stats={stats} one={one} two={two} onSubmit={() => openList(null)} onBoost={openBoost} onCompete={openCompete} />
      <GatheringStrip stats={stats} />
      <div className="mt-8">
        <ActivityMarquee activity={activity} />
      </div>

      <div id="instagram" />
      <section id="leaderboard" className="max-w-7xl mx-auto px-3 sm:px-4 py-10">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2 mb-2"><TrendingUp size={20} strokeWidth={3} /> <Sticker color="#A0F04D">ALWAYS LIVE</Sticker></div>
            <h2 className="font-comic text-3xl sm:text-4xl md:text-5xl">🔥 The ranking board</h2>
            <p className="text-sm font-semibold mt-1 opacity-80">Search a profile and donate to rank them up. More money paid = higher rank. No end date.</p>
          </div>
          <div className="flex items-center gap-2">
            <Users size={16} strokeWidth={3} />
            <span className="font-semibold text-sm">{stats.viewersOnline || 42} PEOPLE WATCHING</span>
          </div>
        </div>
        <SearchBar value={query} onChange={setQuery} />
        <div className="brut p-3 mb-4 bg-[#FF5DA2] text-white font-comic text-xl sm:text-2xl text-center">
          {competitiveBanner(shown, money)}
        </div>
        {results === null && (
          <CategoryTabs categories={categories} active={category} onChange={setCategory} />
        )}
        <div className="mt-5 grid gap-3">
          {results !== null && shown.length === 0 ? (
            <div className="brut p-10 text-center font-comic text-3xl">No profiles match “{query.trim()}”.</div>
          ) : loading && results === null ? (
            <div className="brut p-10 text-center font-comic text-3xl">Loading the board...</div>
          ) : shown.length === 0 ? (
            <div className="brut p-10 text-center">
              <div className="flex justify-center mb-8">
                <TalkCloud>
                  <div className="font-comic text-xl leading-tight">First to add can take #1</div>
                  <p className="text-sm font-bold mt-1">Visibility on PayToTrend — not guaranteed followers.</p>
                </TalkCloud>
              </div>
              <div className="font-comic text-3xl">NO PROFILES YET.</div>
              <p className="mt-2 font-bold">ADD YOURS AND PAY TO TAKE #1.</p>
              <button onClick={() => openList(null)} className="brut-btn mt-4 px-6 py-3 bg-[#FF5DA2] text-white">🔥 ADD PROFILE</button>
            </div>
          ) : (
            shown.map(l => (
              <ListingCard
                key={l.id}
                listing={l}
                mine={!!user && l.ownerId === user.id}
                onBoost={openBoost}
                onCompete={openCompete}
                onShare={setRankCard}
              />
            ))
          )}
        </div>
      </section>

      <HowItWorks />
      <PayingFor />

      <section className="max-w-7xl mx-auto px-3 sm:px-4 py-8">
        <div className="brut-lg p-4 sm:p-8 halftone-yellow flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-comic text-2xl sm:text-3xl md:text-4xl">Add your profile. Pay to climb. Ask fans to donate.</h3>
            <p className="font-semibold mt-1">Pay for yourself, or search someone and donate to rank them up. The board never ends.</p>
          </div>
          <button onClick={() => openList(null)} className="brut-btn px-6 py-3 bg-[#FF5DA2] text-white text-lg">🔥 Add your profile</button>
        </div>
      </section>

      <Footer />

      <SubmitModal
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        categories={categories}
        user={user}
        challenge={challenge}
        onNeedLogin={() => { setSubmitOpen(false); askLogin('You need to log in to start trending.', { type: 'submit', holder: challenge }); }}
        onCreated={async (l) => { if (l.category) setCategory(l.category); await loadAll(); await loadRankings(l.category || category); setRankCard(l); }}
        onPay={(listing, rank) => setInvestTarget({ listing, targetRank: rank || 1, mode: 'SELF_PAY' })}
      />
      <InvestModal
        open={!!investTarget}
        onClose={() => setInvestTarget(null)}
        listing={investTarget?.listing}
        targetRank={investTarget?.targetRank || 1}
        mode={investTarget?.mode || 'SELF_PAY'}
        user={user}
        onDone={afterMoney}
      />
      <RankCardModal open={!!rankCard} onClose={() => setRankCard(null)} listing={rankCard} onAddMoney={(l) => openBoost(l)} />
      <OvertakenModal
        note={overtaken}
        onClose={async () => {
          try { await api('/me/notifications/read', { method: 'POST', body: { id: overtaken?.id } }); } catch (e) {}
          setOvertaken(null);
        }}
        onDefend={async () => {
          try { await api('/me/notifications/read', { method: 'POST', body: { id: overtaken?.id } }); } catch (e) {}
          const listing = myListings.find(l => l.id === overtaken?.listingId);
          setOvertaken(null);
          if (listing) setInvestTarget({ listing, targetRank: 1, mode: 'SELF_PAY' });
          else openList(null);
        }}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={onAuthed} reason={authReason} />
    </div>
  );
}

export default App;
