'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { PlusCircle, Wallet, Zap } from 'lucide-react';
import { Modal } from './brut';
import { api } from '@/lib/client';
import { useMoney } from '@/lib/currency';

function loadRazorpayScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser only'));
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Could not load Razorpay'));
    document.body.appendChild(script);
  });
}

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000];

export default function AddBalanceModal({ open, onClose, user, onAdded }) {
  const { currency, symbol, local, chips } = useMoney();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const amt = Math.floor(Number(amount) || 0);

  const submit = async () => {
    if (amt < 1) return toast.error(`Minimum top-up is ${symbol}1`);
    setLoading(true);
    try {
      await loadRazorpayScript();
      const order = await api('/me/wallet/topup', {
        method: 'POST',
        body: { amount: amt, currency },
      });
      const key = order.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!key) throw new Error('Payment gateway key missing');

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key,
          amount: order.amount,
          currency: order.currency,
          name: 'PayToTrend',
          description: `Add ${local(amt)} to wallet`,
          order_id: order.order_id,
          prefill: { name: user?.name || '', email: user?.email || '' },
          theme: { color: '#FFE156' },
          handler: async (response) => {
            try {
              const result = await api('/me/wallet/topup/verify', {
                method: 'POST',
                body: {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  amount: order.amount,
                },
              });
              toast.success(`🎉 ${local(amt)} added to your wallet!`);
              onAdded && onAdded(result.balance);
              onClose();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              const err = new Error('Payment cancelled');
              err.cancelled = true;
              reject(err);
            },
          },
        });
        rzp.on('payment.failed', (resp) => {
          reject(new Error(resp?.error?.description || 'Payment failed'));
        });
        rzp.open();
      });
    } catch (e) {
      if (e.cancelled) {
        toast.message('Payment cancelled. Nothing was charged.');
      } else {
        toast.error(e.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="💰 Add Balance">
      <div className="space-y-5">
        {/* Info block */}
        <div className="brut p-4 bg-[#FFE156] flex items-start gap-3">
          <Wallet size={28} strokeWidth={3} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-comic text-xl leading-tight">Top up your wallet</div>
            <p className="text-xs font-semibold mt-1 opacity-80">
              Add funds now and use them anytime to pay for rankings — no need to re-enter card details each time.
            </p>
          </div>
        </div>

        {/* Quick amounts */}
        <div>
          <div className="text-xs font-bold uppercase mb-2">Quick amounts</div>
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map(c => (
              <button
                key={c}
                onClick={() => setAmount(String(c))}
                className={`brut-btn px-3 py-2 text-sm ${String(c) === String(amount) ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}
              >
                {local(c)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom amount */}
        <div>
          <div className="text-xs font-bold uppercase mb-2">Or enter custom amount ({currency})</div>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={`e.g. 500`}
            className="brut w-full p-3 outline-none font-comic text-3xl"
          />
        </div>

        {/* Summary */}
        {amt > 0 && (
          <div className="brut p-4 bg-[#A0F04D] flex items-center justify-between">
            <span className="font-bold text-sm">You will add</span>
            <span className="font-comic text-3xl">{local(amt)}</span>
          </div>
        )}

        <div className="brut p-2 bg-[#4DD4E6] font-bold text-xs text-center">
          🔒 Secure Razorpay checkout
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="brut-btn px-4 py-2 is-light bg-white">Cancel</button>
          <button
            onClick={submit}
            disabled={loading || amt < 1}
            className="brut-btn px-6 py-3 bg-[#FFE156] text-black text-lg inline-flex items-center gap-2 disabled:opacity-50"
          >
            <PlusCircle size={18} strokeWidth={3} />
            {loading ? 'Processing...' : `Add ${amt > 0 ? local(amt) : 'Balance'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
