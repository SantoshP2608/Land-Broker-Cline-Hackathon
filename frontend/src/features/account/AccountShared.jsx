import React from 'react';

const paths = {
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  user: 'M20 21v-2a7 7 0 0 0-14 0v2zM16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  shield: 'm12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7zM8 12l3 3 5-6',
  file: 'M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8',
  settings: 'm9 3 6 0 1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01',
  arrow: 'M4 12h16m-6-6 6 6-6 6', swap: 'M3 7h17l-4-4M21 17H4l4 4',
  chevron: 'm5 9 7 7 7-7', upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  lock: 'M5 10h14v11H5zM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  mail: 'M3 5h18v14H3zM3 5l9 8 9-8', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  tag: 'M3 3h9l9 9-9 9-9-9zM7 7h.01',
};
export function Icon({ name, ...props }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.shield} /></svg>;
}
export function Brand() {
  return <a href="#home" className="account-brand" aria-label="LandShield home"><Icon name="shield" /><span>Land<span>Shield</span><small>PROPERTY DOCUMENT VERIFICATION</small></span></a>;
}
export function DemoBadge() {
  return <span className="account-demo"><i /> DEMO VERSION</span>;
}
export function AccountFooter({ onOpenPanel }) {
  return <footer className="account-footer"><span>LandShield <span>· Demo platform</span></span><button className="account-link" onClick={() => onOpenPanel('help')}>Help &amp; support</button></footer>;
}
