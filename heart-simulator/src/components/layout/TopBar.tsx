'use client';

import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useAppStore } from '@/store/useAppStore';
import { useContent } from '@/lib/content';
import { nameOf } from '@/lib/actions';
import { CATEGORY_BY_VALUE } from '@/lib/categories';
import { currentPage, goBack, useBackNavStore } from '@/lib/backNav';
import { IconBack, IconClose, IconMenu, IconSearch } from '@/components/ui/icons';
import { Button, IconButton } from '@/components/ui/Button';
import SearchBox from '@/components/layout/SearchBox';

/**
 * One slim bar on every screen: Menu (everything starts from the main menu), Back, where you are,
 * and search. Roles, the quiz, the tutor, help and install live in the main menu.
 */
export default function TopBar() {
  const mode = useAppStore((s) => s.mode);
  const category = useAppStore((s) => s.activePanelCategory);
  const canGoBack = useBackNavStore((s) => s.canGoBack);
  const prev = useBackNavStore((s) => s.previous);
  useContent(); // re-render with real names once the library has loaded
  // Phones and small tablets: the search field is hidden behind an icon and opens over the whole bar
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    flushSync(() => setSearchOpen(true));
    inputRef.current?.focus(); // inside the tap so phones raise the keyboard
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useAppStore.getState().mode === 'home') return; // the main menu has its own search box
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // Below 768 px the field is behind the search icon, so open it first
        if (window.matchMedia('(max-width: 767px)').matches) flushSync(() => setSearchOpen(true));
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const title = mode === 'simulator' ? 'Case simulator' : mode === 'learn' ? CATEGORY_BY_VALUE[category].label : '';
  const backLabel = !prev ? 'Back'
    : prev.mode === 'home' ? 'Back to the main menu'
      : prev.mode === 'simulator' ? 'Back to the simulator'
        : prev.list && !currentPage().list ? `Back to the ${CATEGORY_BY_VALUE[prev.cat ?? category].short.toLowerCase()} list`
          : prev.item && prev.item !== currentPage().item ? `Back to ${nameOf(prev.item)}` : 'Back';

  return (
    <header className="workspace-header" aria-label="CardioSim">
      <div className="workspace-brand">
        {mode === 'home' ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="" width={22} height={32} className="h-8 w-auto drop-shadow-[0_2px_6px_rgba(220,38,38,0.35)]" />
            <span className="text-sm font-semibold tracking-tight text-ui-text">CardioSim</span>
          </div>
        ) : (
          <>
            <Button
              onClick={() => useAppStore.getState().setMode('home')}
              variant="outline"
              className="px-2.5 gap-1.5"
              aria-label="Main menu"
              title="Main menu: everything in CardioSim"
            >
              <IconMenu size={18} /><span className="text-[13px] font-semibold">Menu</span>
            </Button>
            {canGoBack && (
              <IconButton onClick={goBack} aria-label={backLabel} title={`${backLabel} (same as your phone's Back button)`}>
                <IconBack size={18} />
              </IconButton>
            )}
          </>
        )}
      </div>

      {title && <h1 className="flex-1 min-w-0 truncate text-sm sm:text-[15px] font-semibold text-ui-text">{title}</h1>}

      {mode !== 'home' && (
        <>
          {/* Inline from 768 px; below that it opens over the whole bar */}
          <SearchBox
            id="bar-search"
            ref={inputRef}
            placeholder="Search anatomy, conditions, drugs…  ( / )"
            onDone={() => setSearchOpen(false)}
            className={`max-w-[22rem] ${
              searchOpen ? 'max-md:absolute max-md:inset-0 max-md:z-[60] max-md:max-w-none max-md:min-w-0 max-md:flex max-md:items-center max-md:gap-2 max-md:pl-2 max-md:pr-12 max-md:bg-ui-panel' : 'max-md:hidden'
            }`}
          />
          {searchOpen && (
            <IconButton onClick={() => setSearchOpen(false)} className="md:hidden absolute right-2 z-[61]" aria-label="Close search"><IconClose size={18} /></IconButton>
          )}
          <nav className="workspace-actions md:hidden" aria-label="Search">
            <IconButton onClick={openSearch} aria-label="Search" title="Search ( / )"><IconSearch size={18} /></IconButton>
          </nav>
        </>
      )}
    </header>
  );
}
