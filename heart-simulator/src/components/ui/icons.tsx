import React from 'react';

type P = { className?: string; size?: number };
const base = (size = 16) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const IconHeart = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
);
export const IconSearch = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const IconQuiz = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V14" /><circle cx="12" cy="18" r=".6" fill="currentColor" /><rect x="3" y="3" width="18" height="18" rx="4" /></svg>
);
export const IconTutor = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 9h8M8 13h5" /></svg>
);
export const IconHelp = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V13" /><circle cx="12" cy="16.5" r=".6" fill="currentColor" /></svg>
);
export const IconPanelLeft = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
);
export const IconClose = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const IconCheck = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconChevron = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="m9 18 6-6-6-6" /></svg>
);
export const IconCube = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M21 16V8l-9-5-9 5v8l9 5z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /></svg>
);
export const IconPulse = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
);
export const IconHome = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IconRotate = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
);
export const IconZoomIn = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M11 8v6M8 11h6" /></svg>
);
export const IconZoomOut = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" /></svg>
);
export const IconFlag = ({ className, size }: P) => (
  <svg {...base(size)} className={className}><path d="M4 22V4M4 4h12l-2 4 2 4H4" /></svg>
);
