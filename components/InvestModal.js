'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Crown, Heart } from 'lucide-react';
import { Modal, Sticker } from './brut';
import { api } from '@/lib/client';
import { useMoney } from '@/lib/currency';

const HIGHLIGHTS = [
  { id: '', label: 'None' },
  { id: 'spark', label: '24 hours' },
  { id: 'starter', label: '3 days' },
  { id: 'weekly', label: '7 days' },
  { id: 'monthly', label: '30 days' },
];

export default function InvestModal({ open, onClose, listing, onDone, user, mode = 'DONATION' }) {
  const selfPay = mode === 'SELF_PAY';
  const { currency, conf, money, local, chips, cardMin, symbol, fromBase } = useMoney();

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [plan, setPlan] = useState('weekly');
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState(null);
  const [provider, setProvider] = useState('mock');

  const defaultAmount = () => String((chips && chips[3]) || 101);

  useEffect(() => {
    if (!open) return;
    api('/payments/config').then(c => setProvider(c.provider)).catch(() => setProvider('mock'));
  }, [open]);

  useEffect(() => {
    if (!open || !listing) return;
    setMessage(''); setAnonymous(false); setPlan('weekly'); setTarget(null);
    setAmount(selfPay ? '' : defaultAmount());
    if (selfPay) {
      api(`/rank-target?listingId=${listing.id}`)
        .then(t => {
          setTarget(t);
          setAmount(String(t.isTop ? defaultAmount() : Math.max(1, fromBase(t.toBeatTop))));
        })
        .catch(() => setAmount(defaultAmount()));
    }
  }, [open, listing, selfPay, currency]);

  if (!listing) return null;

  const amt = Math.floor(Number(amount) || 0);
  const rate = conf?.rateToInr || 1;
  const baseAmt = Math.round(amt * rate);
  const newTotal = (listing.raised || 0) + (baseAmt > 0 ? baseAmt : 0);
  const cardReady = provider === 'stripe' && amt >= cardMin;

  const submit = async () => {
    if (amt < 1) return toast.error(`Minimum amount is ${symbol}1`);
    setLoading(true);
    const payload = {
      listingId: listing.id, amount: amt, currency, kind: mode,
      message: selfPay ? '' : message,
      anonymous: selfPay ? false : anonymous,
      plan: plan || undefined,
      backerName: user?.name,
    };

    if (cardReady) {
      try {
        const c = await api('/payments/checkout', { method: 'POST', body: payload });
        if (c.url) {
          toast.success('Opening secure checkout...');
          window.location.assign(c.url);
          return;
        }
      } catch (e) {
        if (e.status !== 503 && e.status !== 409) {
          setLoading(false);
          return toast.error(e.message);
        }
      }
    }

    try {
      const d = await api('/support', { method: 'POST', body: payload });
      toast.success(selfPay
        ? `👑 ${local(amt)} paid — you are now #${d.newRank} in ${listing.category}!`
        : `❤️ ${local(amt)} donated — ${listing.name} is now #${d.newRank}!`);
      onDone({ ...listing, newRank: d.newRank, investedAmount: d.baseAmount || baseAmt, raised: d.totalRaised, creatorShare: d.creatorShare, kind: mode });
      onClose();
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={selfPay ? '👑 Pay to rank #1' : '❤️ Donate to push them up'}>
      <div className="space-y-4">
        <div className="brut p-4 flex items-center gap-3" style={{ background: selfPay ? '#FFE156' : '#FF5DA2', color: selfPay ? '#000' : '#fff' }}>
          {listing.image
            ? <img src={listing.image} alt={listing.name} className="w-12 h-12 brut object-cover bg-white" />
            : <div className="w-12 h-12 brut bg-white flex items-center justify-center text-2xl text-black">{listing.logo}</div>}
          <div className="min-w-0">
            <div className="font-comic text-xl sm:text-2xl leading-none break-all">{listing.name}</div>
            <div className="text-xs font-bold uppercase">{listing.category} • currently #{listing.rank || target?.currentRank || '-'}</div>
          </div>
        </div>

        {selfPay ? (
          <div className="brut p-4 bg-black text-white">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-[#FFE156]">
              <Crown size={14} strokeWidth={3} /> Pay-to-rank calculator
            </div>
            {target ? (
              target.isTop ? (
                <div className="mt-2 text-sm font-bold">You already hold <b className="text-[#FFE156]">#1</b> in {target.category}. Pay more to widen the gap before someone overtakes you.</div>
              ) : (
                <>
                  <div className="mt-2 text-sm font-bold">
                    #1 is <b className="text-[#FFE156]">{target.topName}</b> with {money(target.topScore)}. You have {money(target.myScore)}.
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => setAmount(String(Math.max(1, fromBase(target.toBeatTop))))} className="brut-btn px-3 py-2 is-yellow bg-[#FFE156] text-black text-sm">
                      👑 Grab #1 → {money(target.toBeatTop)}
                    </button>
                    {target.toBeatAbove > 0 && target.toBeatAbove !== target.toBeatTop && (
                      <button onClick={() => setAmount(String(Math.max(1, fromBase(target.toBeatAbove))))} className="brut-btn px-3 py-2 is-light bg-white text-black text-sm">
                        ⬆️ Overtake {target.aboveName} → {money(target.toBeatAbove)}
                      </button>
                    )}
                  </div>
                </>
              )
            ) : (
              <div className="mt-2 text-sm font-bold">Calculating what #1 costs...</div>
            )}
          </div>
        ) : (
          <div className="brut p-3 bg-[#4DD4E6] text-sm font-bold">
            <Heart size={14} strokeWidth={3} className="inline mr-1" />
            Your donation instantly pushes <b>{listing.name}</b> higher on the leaderboard. From {symbol}1, no upper limit.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs font-bold uppercase">{selfPay ? 'Or pay any amount' : 'Pick any amount'} ({currency})</div>
            <Sticker color="#A0F04D" rotate={-3}>NO UPPER LIMIT</Sticker>
          </div>
          <div className="flex flex-wrap gap-2">
            {(chips || []).map(c => (
              <button key={c} onClick={() => setAmount(String(c))}
                className={`brut-btn px-3 py-2 text-sm ${String(c) === String(amount) ? 'is-pink bg-[#FF5DA2] text-white' : 'is-light bg-white'}`}>
                {local(c)}
              </button>
            ))}
          </div>
          <input type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)}
            placeholder={`Enter any amount (min ${symbol}1)`} className="brut w-full p-3 mt-3 outline-none font-comic text-2xl" />
          <div className="text-xs font-semibold mt-1 opacity-70">
            {symbol}1 is welcome. {local(100000)} is welcome too. There is no cap.
            {currency !== 'INR' && baseAmt > 0 && <> Ledger value ≈ ₹{baseAmt.toLocaleString('en-IN')}.</>}
          </div>
          {provider === 'stripe' && amt > 0 && amt < cardMin && (
            <div className="brut mt-2 p-2 bg-[#FFE156] text-[11px] font-bold">
              Card payments start at {local(cardMin)} (Stripe&apos;s minimum). {local(amt)} will be recorded in demo mode and still moves the rank.
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="brut p-3 bg-[#4DD4E6]">
            <div className="text-[11px] font-bold uppercase">Total gathered after this</div>
            <div className="font-comic text-2xl sm:text-3xl">{money(newTotal)}</div>
            <div className="mt-2 text-[11px] font-bold leading-snug bg-white brut p-2">
              Your {local(amt || 0)} splits as:<br />
              🎁 {local(Math.round((amt || 0) * 0.3))} creator • 🤲 {local(Math.round((amt || 0) * 0.4))} people in need • ⚙️ {local((amt || 0) - Math.round((amt || 0) * 0.3) - Math.round((amt || 0) * 0.4))} servers &amp; devs
            </div>
          </div>
          <div className="brut p-3 bg-white">
            <div className="text-[11px] font-bold uppercase mb-1">SPONSORED highlight (optional)</div>
            <div className="flex flex-wrap gap-1">
              {HIGHLIGHTS.map(h => (
                <button key={h.id} onClick={() => setPlan(h.id)}
                  className={`brut-btn px-2 py-1 text-xs ${plan === h.id ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>{h.label}</button>
              ))}
            </div>
            <div className="text-[11px] font-semibold mt-2 opacity-70">Adds a visible SPONSORED badge while it lasts.</div>
          </div>
        </div>

        {!selfPay && (
          <>
            <input value={message} onChange={e => setMessage(e.target.value)} maxLength={200}
              placeholder="Leave a message for them (optional)" className="brut w-full p-3 outline-none" />
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} className="w-4 h-4" />
              Donate anonymously
            </label>
          </>
        )}

        {cardReady ? (
          <div className="brut p-2 bg-[#4DD4E6] font-bold text-xs text-center">
            🔒 Secure Stripe checkout ({currency} sandbox) — test card 4242 4242 4242 4242, any future date &amp; CVC.
          </div>
        ) : (
          <div className="brut p-2 halftone-pink text-white font-bold text-xs text-center">
            🧪 DEMO MODE — no card is charged for this amount.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="brut-btn px-4 py-2 is-light bg-white">Cancel</button>
          <button onClick={submit} disabled={loading} className="brut-btn px-6 py-3 is-lime bg-[#A0F04D] text-lg">
            {loading ? 'Processing...' : selfPay ? `👑 Pay ${local(amt || 0)}` : `❤️ Donate ${local(amt || 0)}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
