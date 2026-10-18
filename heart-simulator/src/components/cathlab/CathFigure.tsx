'use client';

import React, { useEffect, useState } from 'react';
import type { CathImage } from '@/data/cathImages';
import { IconClose } from '@/components/ui/icons';

/** Author and licence, each linked: the article it came from and the licence text (CC BY asks for both) */
export function ImageCredit({ img, className = '' }: { img: CathImage; className?: string }) {
  const link = 'underline decoration-dotted underline-offset-2 hover:text-slate-200';
  return (
    <span className={className}>
      Image: <a href={img.source} target="_blank" rel="noopener noreferrer" className={link}>{img.credit}</a>
      {' · '}
      <a href={img.licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>{img.license}</a>
    </span>
  );
}

/** Full-screen view of one image; closes with its button, a tap on the backdrop or Escape */
export function ImageZoom({ img, showCaption = true, onClose }: { img: CathImage; showCaption?: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label={img.alt} onClick={onClose}>
      <button onClick={onClose} className="self-end p-3 text-slate-200" aria-label="Close the image"><IconClose size={20} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt={img.alt} width={img.width} height={img.height} className="flex-1 min-h-0 w-full object-contain" />
      <div className="p-3 text-center space-y-1" onClick={(e) => e.stopPropagation()}>
        {showCaption && <p className="text-[13px] text-slate-200 leading-snug max-w-2xl mx-auto">{img.caption}</p>}
        <ImageCredit img={img} className="block text-[11px] text-slate-400" />
      </div>
    </div>
  );
}

/** A catalog figure: the image (tap to enlarge), what it shows, and its credit */
export function CathFigure({ img }: { img: CathImage }) {
  const [zoom, setZoom] = useState(false);
  return (
    <figure className="rounded-lg overflow-hidden border border-slate-700 bg-black">
      <button onClick={() => setZoom(true)} className="block w-full" aria-label={`Enlarge: ${img.alt}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.src} alt={img.alt} width={img.width} height={img.height} loading="lazy" className="w-full h-auto max-h-72 object-contain" />
      </button>
      <figcaption className="px-2 py-1.5 bg-cardiac-dark space-y-0.5">
        <p className="text-[11px] text-slate-200 leading-snug">{img.caption}</p>
        <ImageCredit img={img} className="block text-[9px] text-slate-500" />
      </figcaption>
      {zoom && <ImageZoom img={img} onClose={() => setZoom(false)} />}
    </figure>
  );
}
