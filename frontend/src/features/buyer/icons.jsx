import React from 'react';

/** Shared inline SVG icon set for the buyer experience. No icon library dependency. */
export function Icon({ kind, ...rest }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', ...rest };
  switch (kind) {
    case 'dashboard':
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
    case 'requests':
      return <svg {...common}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
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
    case 'chevron-right':
      return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;
    case 'chevron-left':
      return <svg {...common}><path d="m15 6-6 6 6 6" /></svg>;
    case 'back':
      return <svg {...common}><path d="M20 12H4m7-7-7 7 7 7" /></svg>;
    case 'check':
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case 'heart':
      return <svg {...common}><path d="M20.8 8.6c0 4.4-8.8 10.4-8.8 10.4S3.2 13 3.2 8.6a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z" /></svg>;
    case 'heart-filled':
      return <svg {...common} fill="currentColor"><path d="M20.8 8.6c0 4.4-8.8 10.4-8.8 10.4S3.2 13 3.2 8.6a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z" /></svg>;
    case 'share':
      return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4" /></svg>;
    case 'map':
      return <svg {...common}><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>;
    case 'list':
      return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
    case 'filter':
      return <svg {...common}><path d="M4 5h16M7 12h10M10 19h4" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z" /><circle cx="12" cy="9" r="2.5" /></svg>;
    case 'ruler':
      return <svg {...common}><path d="M3 16 16 3l5 5L8 21Z" /><path d="m13 6 2 2M9 10l2 2M5 14l2 2" /></svg>;
    case 'road':
      return <svg {...common}><path d="M5 21 9 3h6l4 18" /><path d="M12 7v3M12 14v3" /></svg>;
    case 'zoning':
      return <svg {...common}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></svg>;
    case 'leaf':
      return <svg {...common}><path d="M5 21c0-9 5-16 16-16-1 10-7 16-16 16Z" /><path d="M5 21c2-5 5-8 10-11" /></svg>;
    case 'doc':
      return <svg {...common}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus':
      return <svg {...common}><path d="M5 12h14" /></svg>;
    case 'locate':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
    case 'play':
      return <svg {...common} fill="currentColor"><path d="M8 5v14l11-7Z" /></svg>;
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case 'copy':
      return <svg {...common}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M4 12h16m-7-7 7 7-7 7" /></svg>;
    case 'message':
      return <svg {...common}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /></svg>;
    case 'send':
      return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z" /></svg>;
    case 'shield':
      return <svg {...common}><path d="m12 3 7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>;
    case 'land-home':
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></svg>;
    default:
      return null;
  }
}
