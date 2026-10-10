import React, { useEffect, useId, useRef } from 'react';

const paths = {
  check: <path d="m5 12 4 4L19 6" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  home: <><path d="m2 10 10-8 10 8M5 9v12h14V9M9 21v-8h6v8" /></>,
  list: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 7h.01M11 7h5M8 12h.01M11 12h5M8 17h.01M11 17h5" /></>,
  file: <><path d="M14 2H5v20h14V7l-5-5v5h5M8 12h8M8 16h8" /></>,
  users: <><circle cx="9" cy="7" r="3" /><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6M20 21v-4a6 6 0 0 0-3-5" /></>,
  user: <><circle cx="12" cy="6" r="4" /><path d="M3 22v-3a9 9 0 0 1 18 0v3Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v7l4 2" /></>,
  search: <><circle cx="10" cy="10" r="7" /><path d="m16 16 5 5" /></>,
  info: <><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7h.01" /></>,
  help: <><circle cx="12" cy="12" r="10" /><path d="M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="12" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4M12 15v3" /></>,
  shield: <><path d="m12 2 9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6Z" /><path d="m7 12 4 4 6-8" /></>,
  upload: <><path d="M6 18H5a4 4 0 0 1-1-8 8 8 0 0 1 16-1 5 5 0 0 1 0 10h-2M12 22V10m-5 5 5-5 5 5" /></>,
  edit: <><path d="m15 3 6 6L9 21H3v-6ZM12 6l6 6" /></>,
  pin: <><path d="M19 9c0 5-7 13-7 13S5 14 5 9a7 7 0 1 1 14 0Z" /><circle cx="12" cy="9" r="2" /></>,
  switch: <path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
};

export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.info}</svg>;
}

export function Button({ variant = 'outline', children, className = '', ...props }) {
  return <button type="button" className={`ls-btn ls-btn--${variant} ${className}`} {...props}>{children}</button>;
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`ls-badge ls-badge--${tone}`}>{children}</span>;
}

export function Panel({ className = '', children, ...props }) {
  return <section className={`ls-panel ${className}`} {...props}>{children}</section>;
}

export function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="ls-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <Button className="ls-dialog__close" aria-label="Close dialog" onClick={onClose}><Icon name="x" /></Button>
    <p className="ls-eyebrow">LANDSHIELD · DEMONSTRATION</p>
    <h2 id={id}>{title}</h2>
    {children}
  </dialog>;
}

export function formatIST(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(date)) + ' IST';
}

export function formatINR(amount) {
  const text = String(amount || '0');
  const [integer, decimal = ''] = text.split('.');
  if (!/^\d+$/.test(integer) || !/^\d{0,2}$/.test(decimal)) return 'Price unavailable';
  return `₹${BigInt(integer).toLocaleString('en-IN')}${decimal && decimal !== '00' ? `.${decimal.padEnd(2, '0')}` : ''}`;
}