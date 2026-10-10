import React, { useEffect, useState } from 'react';
import Marketplace from './Marketplace.jsx';
import LandDetail from './LandDetail.jsx';
import { LISTINGS } from './listings.js';

function readRoute() {
  if (typeof window === 'undefined') return { page: 'marketplace' };
  const hash = window.location.hash || '#marketplace';
  if (hash.startsWith('#land-')) {
    const id = hash.slice('#land-'.length);
    return LISTINGS.some((item) => item.id === id) ? { page: 'land', id } : { page: 'marketplace' };
  }
  return { page: 'marketplace' };
}

/**
 * Shared buyer shell: listens to #marketplace / #land-{id} hash routes and renders the
 * appropriate buyer page. No backend is connected — all listing data is synthetic/demo-only.
 */
export default function BuyerPages({ account, onSignIn, onSwitchToSelling, onGoHome, onProfile, onOpenPanel }) {
  const [route, setRoute] = useState(readRoute);
  const [savedIds, setSavedIds] = useState(() => new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function onHashChange() { setRoute(readRoute()); }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function openListing(id) { if (typeof window !== 'undefined') window.location.hash = `land-${id}`; }
  function goToMarketplace() { if (typeof window !== 'undefined') window.location.hash = 'marketplace'; }
  function toggleSave(id) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const shared = { account, onSignIn, onSwitchToSelling, onGoHome, onProfile, onOpenPanel };

  if (route.page === 'land') {
    return (
      <LandDetail
        id={route.id}
        {...shared}
        onBack={goToMarketplace}
        saved={savedIds.has(route.id)}
        onToggleSave={toggleSave}
      />
    );
  }

  return (
    <Marketplace
      {...shared}
      onOpenListing={openListing}
      savedIds={savedIds}
      onToggleSave={toggleSave}
    />
  );
}
