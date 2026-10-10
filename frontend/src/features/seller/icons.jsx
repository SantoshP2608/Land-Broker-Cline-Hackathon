import React from 'react';

/** Shared inline SVG icon set for the seller experience. No icon library dependency. */
export function Icon({ kind, ...rest }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', ...rest };
  switch (kind) {
    case 'dashboard':
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'listings':
      return <svg {...common}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
    case 'verification':
      return <svg {...common}><path d="m12 3 7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'requests':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1" /><path d="M17 11a3 3 0 1 0 0-6M15 20v-1a5.5 5.5 0 0 0-2.3-4.5M21 20v-1a5 5 0 0 0-4-4.9" /></svg>;
    case 'transactions':
      return <svg {...common}><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>;
    case 'profile':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0 1 16 0" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" /></svg>;
    case 'switch':
      return <svg {...common}><path d="m17 2 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
    case 'bell':
      return <svg {...common}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>;
    case 'chevron-down':
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
    case 'check':
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>;
    case 'draft':
      return <svg {...common}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M4 12h16m-7-7 7 7-7 7" /></svg>;
    case 'chevron-right':
      return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
    case 'back':
      return <svg {...common}><path d="M20 12H4m7-7-7 7 7 7" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z" /><circle cx="12" cy="9" r="2.5" /></svg>;
    case 'lightbulb':
      return <svg {...common}><path d="M9 18h6M10 22h4M12 2a6 6 0 0 0-3.5 10.9c.6.45 1 1.17 1 1.94V16h5v-1.16c0-.77.4-1.49 1-1.94A6 6 0 0 0 12 2Z" /></svg>;
    case 'land-home':
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
    case 'home':
      return <svg {...common}><path d="M3 11h18v10H3zM12 2 2 11h20z" /></svg>;
    default:
      return null;
  }
}
