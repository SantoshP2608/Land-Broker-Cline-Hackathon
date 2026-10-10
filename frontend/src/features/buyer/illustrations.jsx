import React from 'react';

/**
 * Original, hand-authored inline SVG illustrations standing in for property photography.
 * These are honest schematic drawings (not real photographs of any actual parcel) used so the
 * demo never implies a verified photo exists for land that has not been inspected.
 */
const PALETTES = {
  agricultural: { sky: '#8fd0ea', hill: '#4c8f67', field: '#6fae4c', rowA: '#5c9a3f', rowB: '#7cbb57' },
  residential: { sky: '#9fd3ef', hill: '#5a7f98', field: '#c9b98f', rowA: '#b7a57b', rowB: '#d8c9a0' },
  commercial: { sky: '#a7c9e6', hill: '#64758a', field: '#9a8f7c', rowA: '#857a66', rowB: '#ab9f89' },
};

export function LandIllustration({ type = 'agricultural', variant = 0, className = '' }) {
  const p = PALETTES[type] || PALETTES.agricultural;
  const seed = variant % 4;
  return (
    <svg className={className} viewBox="0 0 400 240" role="img" aria-label={`Illustrated schematic of ${type} land, variant ${variant + 1}`}>
      <rect width="400" height="240" fill={p.sky} />
      <path d={`M0 ${120 + seed * 4} Q100 ${90 + seed * 6} 200 ${110 + seed * 3} T400 ${105 + seed * 5} V240 H0 Z`} fill={p.hill} opacity="0.55" />
      <rect y="140" width="400" height="100" fill={p.field} />
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={i * 70 - 20} y="140" width="34" height="100" fill={i % 2 === seed % 2 ? p.rowA : p.rowB} transform={`skewX(-18)`} opacity="0.85" />
      ))}
      {type === 'residential' ? <rect x="150" y="150" width="90" height="55" fill="#2b3f52" opacity="0.85" /> : null}
      {type === 'commercial' ? <rect x="120" y="120" width="60" height="90" fill="#2b3f52" opacity="0.85" /> : null}
      {type === 'commercial' ? <rect x="200" y="95" width="50" height="115" fill="#1f3141" opacity="0.85" /> : null}
      <circle cx={60 + seed * 60} cy="50" r="18" fill="#fff" opacity="0.85" />
      <g aria-hidden="true">
        <path d="M200 90 C200 120 170 140 170 160 C170 180 230 180 230 160 C230 140 200 120 200 90 Z" fill="#17d1c0" />
        <circle cx="200" cy="120" r="6" fill="#06304a" />
      </g>
      <text x="10" y="232" fontSize="10" fill="#ffffffaa" fontFamily="sans-serif">Illustrative schematic — not an actual site photo</text>
    </svg>
  );
}

export function SchematicMap({ listings = [], selectedId, onSelectPin, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 400 320" role="img" aria-label="Schematic demo map of listing locations">
      <rect width="400" height="320" fill="#0c2f4c" />
      <g stroke="#1c4f78" strokeWidth="2" opacity="0.6">
        <path d="M0 80 H400" /><path d="M0 160 H400" /><path d="M0 240 H400" />
        <path d="M100 0 V320" /><path d="M200 0 V320" /><path d="M300 0 V320" />
      </g>
      <text x="14" y="26" fill="#9cc6e4" fontSize="13" fontFamily="sans-serif">Hyderabad (demo area)</text>
      {listings.map((item) => {
        const active = item.id === selectedId;
        return (
          <g
            key={item.id}
            role="button"
            tabIndex={0}
            aria-label={`${item.title} in ${item.location}`}
            aria-pressed={active}
            transform={`translate(${item.mapX}, ${item.mapY})`}
            onClick={() => onSelectPin?.(item.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectPin?.(item.id); } }}
            style={{ cursor: 'pointer' }}
          >
            <circle r={active ? 12 : 9} fill={active ? '#17d1c0' : '#2b8fe0'} stroke="#06304a" strokeWidth="2" />
            {active ? <circle r="18" fill="none" stroke="#17d1c0" strokeWidth="1.5" opacity="0.6" /> : null}
          </g>
        );
      })}
    </svg>
  );
}
