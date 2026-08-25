'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Download, Image as ImageIcon, Upload, X } from 'lucide-react';
import { api } from '@/lib/client';

const NETWORKS = [
  { id: 'instagram', label: '📸 Instagram', base: 'https://instagram.com/', enabled: true },
  { id: 'x', label: '𝕏 X', base: 'https://x.com/', enabled: false },
  { id: 'youtube', label: '▶️ YouTube', base: 'https://youtube.com/@', enabled: false },
  { id: 'linkedin', label: '💼 LinkedIn', base: 'https://linkedin.com/in/', enabled: false },
];

export default function ProfilePicker({ form, setForm }) {
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [hint, setHint] = useState('');

  const network = form.network || 'instagram';
  const net = NETWORKS.find(n => n.id === network) || NETWORKS[0];

  const importPic = async () => {
    const h = handle.trim();
    if (!h) return toast.error('Type your @handle first');
    setBusy(true); setHint('');
    try {
      const d = await api('/import/profile', { method: 'POST', body: { network, handle: h } });
      setForm(f => ({
        ...f,
        image: d.imageUrl,
        network,
        handle: d.handle,
        name: f.name || '@' + d.handle,
        website: f.website || net.base + d.handle,
      }));
      toast.success('Picture imported (unverified)');
    } catch (e) {
      setHint(e.message);
      // still prefill handle + link so the listing is usable
      setForm(f => ({
        ...f, network, handle: h.replace(/^@/, ''),
        name: f.name || '@' + h.replace(/^@/, ''),
        website: f.website || net.base + h.replace(/^@/, ''),
      }));
    } finally { setBusy(false); }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Pick an image file');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const size = 220;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setForm(f => ({ ...f, image: dataUrl }));
        toast.success('Picture added');
      };
      img.onerror = () => toast.error('Could not read that image');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const isSocial = !['startup', 'product'].includes(network);

  return (
    <div className="brut p-4 bg-white space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase">
        <ImageIcon size={14} strokeWidth={3} /> {isSocial ? 'Import your profile picture' : 'Add a logo or picture'}
      </div>

      {isSocial && (
        <>
          <div className="flex flex-wrap gap-2">
            {NETWORKS.map(n => (
              <button key={n.id} type="button" disabled={!n.enabled} onClick={() => n.enabled && setForm(f => ({ ...f, network: n.id }))}
                className={`brut-btn px-3 py-2 text-xs ${!n.enabled ? 'opacity-40 cursor-not-allowed' : network === n.id ? 'is-active bg-black text-[#FFE156]' : 'is-light bg-white'}`}>
                {n.label}{!n.enabled ? ' (soon)' : ''}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <input value={handle} onChange={e => setHandle(e.target.value)}
              placeholder={`@your_${network}_handle`} className="brut p-3 outline-none flex-1 w-full sm:w-auto min-w-0" />
            <button type="button" onClick={importPic} disabled={busy}
              className="brut-btn px-4 py-3 is-lime bg-[#A0F04D] text-sm inline-flex items-center gap-1">
              <Download size={14} strokeWidth={3} /> {busy ? 'Fetching...' : 'Import picture'}
            </button>
          </div>

          {hint && (
            <div className="brut p-3 bg-[#FFE156] text-xs font-bold">
              {hint}
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="brut-btn px-4 py-3 is-light bg-white text-sm inline-flex items-center gap-1 cursor-pointer">
          <Upload size={14} strokeWidth={3} /> Upload picture
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
        </label>
        <input value={pasteUrl} onChange={e => setPasteUrl(e.target.value)}
          placeholder="or paste an image URL" className="brut p-3 outline-none flex-1 w-full sm:w-auto min-w-0" />
        <button type="button" onClick={() => {
          if (!/^https?:\/\//.test(pasteUrl.trim())) return toast.error('Paste a valid http(s) image URL');
          setForm(f => ({ ...f, image: pasteUrl.trim() }));
          toast.success('Picture set');
        }} className="brut-btn px-4 py-3 is-light bg-white text-sm">Use URL</button>
      </div>

      {form.image ? (
        <div className="flex items-center gap-3">
          <img src={form.image} alt="profile" className="w-16 h-16 object-cover brut" />
          <div className="text-xs font-bold">
            Preview • <span className="opacity-70">unverified picture</span>
            <button type="button" onClick={() => setForm(f => ({ ...f, image: '' }))}
              className="ml-2 underline inline-flex items-center gap-1"><X size={11} strokeWidth={3} /> remove</button>
          </div>
        </div>
      ) : (
        <div className="text-xs font-semibold opacity-70">No picture yet — your emoji will be used instead.</div>
      )}
    </div>
  );
}
