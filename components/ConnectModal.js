'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Mail, Send } from 'lucide-react';
import { Modal } from './brut';
import { api } from '@/lib/client';

export default function ConnectModal({ open, onClose, listing, onNeedLogin }) {
  const [contact, setContact] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setContact(null); setMessage(''); } }, [open, listing?.id]);
  if (!listing) return null;

  const connect = async () => {
    setLoading(true);
    try {
      const d = await api('/connect', { method: 'POST', body: { listingId: listing.id, message } });
      setContact(d.contact);
      toast.success('Connected! Contact details unlocked.');
    } catch (e) {
      if (e.status === 401) { onClose(); onNeedLogin(listing); return; }
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="🤝 How to connect">
      <div className="space-y-4">
        <div className="brut p-4 bg-[#4DD4E6] flex items-center gap-3">
          {listing.image ? <img src={listing.image} alt={listing.name} className="w-12 h-12 brut object-cover bg-white" /> : <div className="w-12 h-12 brut bg-white flex items-center justify-center text-2xl">{listing.logo}</div>}
          <div className="min-w-0">
            <div className="font-comic text-2xl leading-none truncate">{listing.name}</div>
            <div className="text-xs font-bold uppercase">{listing.category}</div>
          </div>
        </div>

        {!contact ? (
          <>
            <p className="text-sm font-semibold">Send a connect request. They get your name and email, and their contact details unlock for you instantly.</p>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={300}
              placeholder="Hi! I'd love to collaborate because..." className="brut w-full p-3 outline-none" />
            <button onClick={connect} disabled={loading} className="brut-btn w-full py-3 bg-[#FF5DA2] text-white text-lg inline-flex items-center justify-center gap-2">
              <Send size={18} strokeWidth={3} /> {loading ? 'Connecting...' : 'Send connect request'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="brut p-4 bg-[#A0F04D]">
              <div className="font-comic text-2xl">Request sent 🎉</div>
              <div className="text-sm font-semibold">Here is how you reach {contact.name}:</div>
            </div>
            {contact.website && (
              <a href={contact.website} target="_blank" rel="noreferrer" className="brut-btn w-full py-3 bg-white flex items-center justify-center gap-2 font-bold">
                <ExternalLink size={16} strokeWidth={3} /> {contact.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="brut-btn w-full py-3 bg-[#FFE156] flex items-center justify-center gap-2 font-bold">
                <Mail size={16} strokeWidth={3} /> {contact.email}
              </a>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
