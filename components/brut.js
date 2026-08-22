'use client';
import { X } from 'lucide-react';

export function Sticker({ children, color = '#FFE156', rotate = -4 }) {
  return (
    <span className="sticker" style={{ background: color, transform: `rotate(${rotate}deg)` }}>{children}</span>
  );
}

export function Modal({ open, onClose, children, wide, title = '💥 Donate & Colab' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-2 sm:p-4 overflow-y-auto" onClick={onClose}>
      <div className={`brut-lg bg-white ${wide ? 'max-w-2xl' : 'max-w-md'} w-full my-3 sm:my-8 max-h-[94vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center gap-2 border-b-3 border-black bg-[#FFE156] p-3 sticky top-0 z-10" style={{ borderBottomWidth: 3 }}>
          <div className="font-comic text-lg sm:text-2xl px-1 leading-tight">{title}</div>
          <button onClick={onClose} className="brut-btn w-9 h-9 is-light bg-white flex items-center justify-center flex-shrink-0"><X size={16} strokeWidth={3} /></button>
        </div>
        <div className="p-3 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatBox({ label, value, sub, color = '#fff' }) {
  return (
    <div className="brut p-3 sm:p-4" style={{ background: color }}>
      <div className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-comic text-2xl sm:text-3xl md:text-4xl leading-tight mt-1 break-words">{value}</div>
      {sub && <div className="text-xs font-semibold mt-1">{sub}</div>}
    </div>
  );
}
