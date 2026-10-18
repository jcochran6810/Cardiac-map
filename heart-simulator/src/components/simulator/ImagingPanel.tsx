'use client';

import React, { useState } from 'react';
import type { SimState } from '@/lib/sim/scenario/types';
import { clockText } from '@/lib/sim/scenario/engine';
import { CINE_VIEW_BY_ID, angleText } from '@/lib/cathlab/views';
import { CATH_IMAGES } from '@/data/cathImages';
import CArmDiagram from '@/components/cathlab/CArmDiagram';
import { IconClose } from '@/components/ui/icons';

/** Cath lab cases: every cine run recorded so far, newest first — the view, the C-arm angles, the picture */
export default function ImagingPanel({ state }: { state: SimState }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const runs = state.images.map((r, i) => ({ ...r, n: i + 1 })).reverse();
  const reading = state.pendingRead?.kind === 'angio' && !state.ended;
  if (!runs.length) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <div className="text-sm font-semibold text-white">No cine runs yet</div>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            Every picture in the lab is a choice: the view decides what you can see. The runs you record (under
            <b className="text-slate-200"> Angiography &amp; imaging</b>) appear here, newest first.
          </p>
        </div>
      </div>
    );
  }
  const big = zoom ? CATH_IMAGES[zoom] : undefined;
  return (
    <div className="absolute inset-0 overflow-y-auto px-3 py-2.5 space-y-2">
      {reading && (
        <div className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[12px] text-amber-100">
          What does this run show? Look at it, then give your read to your preceptor.
        </div>
      )}
      {runs.map((r) => {
        const v = r.id ? CINE_VIEW_BY_ID[r.id] : undefined;
        const img = r.image ? CATH_IMAGES[r.image] : undefined;
        return (
          <article key={r.n} className="rounded-lg border border-slate-700 bg-cardiac-dark/50 overflow-hidden">
            <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-slate-700/70">
              <span className="font-mono text-[10px] text-slate-500 tabular-nums">Run {r.n} · {clockText(r.minute)}</span>
              <span className="text-[13px] font-semibold text-white truncate">{v?.name ?? r.view}</span>
              {v && <span className="ml-auto text-[11px] font-mono text-sky-300 whitespace-nowrap">{angleText(v)}</span>}
            </div>
            {img && (
              <button onClick={() => setZoom(r.image!)} className="block w-full bg-black" aria-label={`Enlarge: ${img.alt}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.alt} className="w-full max-h-[320px] object-contain" />
              </button>
            )}
            {(v || img) && (
              <div className="flex gap-3 items-center px-2.5 py-2">
                {v && <CArmDiagram rot={v.rot} ang={v.ang} className="w-40 sm:w-48 shrink-0" />}
                <div className="min-w-0 text-[12px] leading-snug">
                  {v && (
                    <>
                      <div className="text-slate-400">Shows best</div>
                      <div className="text-slate-100">{v.best}.</div>
                    </>
                  )}
                  {img && <div className="mt-1 text-[10px] text-slate-500">Image: {img.credit} · {img.license}</div>}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {big && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" role="dialog" aria-label={big.alt}>
          <button onClick={() => setZoom(null)} className="self-end p-3 text-slate-200" aria-label="Close the image"><IconClose size={20} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={big.src} alt={big.alt} className="flex-1 min-h-0 w-full object-contain" />
          <div className="p-2 text-center text-[11px] text-slate-400">{big.credit} · {big.license}</div>
        </div>
      )}
    </div>
  );
}
