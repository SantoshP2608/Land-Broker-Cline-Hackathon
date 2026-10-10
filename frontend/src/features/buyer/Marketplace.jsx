import React, { useMemo, useState } from 'react';
import BuyerLayout from './BuyerLayout.jsx';
import { Icon } from './icons.jsx';
import { LandIllustration, SchematicMap } from './illustrations.jsx';
import { LISTINGS } from './listings.js';
import './Marketplace.css';

const TYPES = ['All Types', 'Agricultural', 'Residential', 'Commercial'];
const SORTS = ['Newest First', 'Price: Low to High', 'Price: High to Low', 'Area: Large to Small'];

function ListingCard({ listing, saved, onToggleSave, onOpen }) {
  return (
    <article className="land-card">
      <div className="land-card__media">
        <LandIllustration type={listing.typeKey} variant={0} className="land-card__img" />
        <span className={`land-card__badge${listing.status === 'Verified' ? ' land-card__badge--verified' : ' land-card__badge--pending'}`}>
          {listing.status}
        </span>
        <button
          type="button"
          className={`land-card__heart${saved ? ' land-card__heart--active' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
          onClick={() => onToggleSave(listing.id)}
        >
          <Icon kind={saved ? 'heart-filled' : 'heart'} />
        </button>
      </div>
      <div className="land-card__body">
        <h3>{listing.title}</h3>
        <p className="land-card__loc"><Icon kind="pin" /> {listing.location}</p>
        <p className="land-card__meta">
          <span><Icon kind="ruler" /> {listing.areaLabel}</span>
          <span><Icon kind="leaf" /> {listing.type}</span>
        </p>
        <div className="land-card__footer">
          <span className="land-card__price">
            ₹ {listing.priceLabel}
            <small>({listing.priceUnit})</small>
          </span>
          <button type="button" className="land-card__open" onClick={() => onOpen(listing.id)} aria-label={`View details for ${listing.title}`}>
            <Icon kind="chevron-right" />
          </button>
        </div>
      </div>
    </article>
  );
}

function ListingRow({ listing, saved, onToggleSave, onOpen }) {
  return (
    <article className="land-row">
      <div className="land-row__media"><LandIllustration type={listing.typeKey} variant={1} className="land-row__img" /></div>
      <div className="land-row__body">
        <div className="land-row__top">
          <h3>{listing.title}</h3>
          <span className={`land-card__badge${listing.status === 'Verified' ? ' land-card__badge--verified' : ' land-card__badge--pending'}`}>{listing.status}</span>
        </div>
        <p className="land-card__loc"><Icon kind="pin" /> {listing.location}</p>
        <p className="land-card__meta">
          <span><Icon kind="ruler" /> {listing.areaLabel}</span>
          <span><Icon kind="leaf" /> {listing.type}</span>
        </p>
      </div>
      <div className="land-row__right">
        <span className="land-card__price">₹ {listing.priceLabel}<small>({listing.priceUnit})</small></span>
        <div className="land-row__actions">
          <button
            type="button"
            className={`land-card__heart land-card__heart--inline${saved ? ' land-card__heart--active' : ''}`}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${listing.title} from saved` : `Save ${listing.title}`}
            onClick={() => onToggleSave(listing.id)}
          >
            <Icon kind={saved ? 'heart-filled' : 'heart'} />
          </button>
          <button type="button" className="land-row__view" onClick={() => onOpen(listing.id)}>View <Icon kind="chevron-right" /></button>
        </div>
      </div>
    </article>
  );
}

export default function Marketplace({ account, onSignIn, onSwitchToSelling, onGoHome, onProfile, onOpenListing, savedIds, onToggleSave }) {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('All Types');
  const [price, setPrice] = useState('Any');
  const [area, setArea] = useState('Any');
  const [sort, setSort] = useState('Newest First');
  const [view, setView] = useState('list');
  const [selectedPin, setSelectedPin] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => {
    let items = LISTINGS.filter((item) => {
      const hay = `${item.title} ${item.location} ${item.district} ${item.state}`.toLowerCase();
      if (keyword.trim() && !hay.includes(keyword.trim().toLowerCase())) return false;
      if (type !== 'All Types' && item.type !== type) return false;
      if (price === 'Under 50L' && item.price >= 5000000) return false;
      if (price === '50L - 1Cr' && (item.price < 5000000 || item.price > 10000000)) return false;
      if (price === 'Above 1Cr' && item.price <= 10000000) return false;
      if (area === 'Under 1 Acre' && item.area >= 1) return false;
      if (area === '1-3 Acres' && (item.area < 1 || item.area > 3)) return false;
      if (area === 'Above 3 Acres' && item.area <= 3) return false;
      return true;
    });
    items = [...items].sort((a, b) => {
      if (sort === 'Price: Low to High') return a.price - b.price;
      if (sort === 'Price: High to Low') return b.price - a.price;
      if (sort === 'Area: Large to Small') return b.area - a.area;
      return new Date(b.listedOn) - new Date(a.listedOn);
    });
    return items;
  }, [keyword, type, price, area, sort]);

  function resetFilters() {
    setKeyword(''); setType('All Types'); setPrice('Any'); setArea('Any'); setSort('Newest First');
  }

  return (
    <BuyerLayout active="marketplace" onNavigate={() => {}} onSwitchToSelling={onSwitchToSelling} onGoHome={onGoHome} onProfile={onProfile} account={account} onSignIn={onSignIn}>
      <section className="marketplace-hero">
        <h1>Find <span className="marketplace-hero__accent">Verified</span> Lands</h1>
        <p>Explore genuine and verified land listings with complete document checks and transparent details.</p>
        <form className="marketplace-search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon kind="search" />
          <input
            type="search"
            placeholder="Search by location, city, village, or keyword…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            aria-label="Search by location, city, village, or keyword"
          />
          <button type="submit">Search</button>
        </form>
        <div className="marketplace-filters">
          <label className="marketplace-filter">
            <span>Land Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="marketplace-filter">
            <span>Price Range</span>
            <select value={price} onChange={(e) => setPrice(e.target.value)}>
              {['Any', 'Under 50L', '50L - 1Cr', 'Above 1Cr'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="marketplace-filter">
            <span>Area (Acres)</span>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {['Any', 'Under 1 Acre', '1-3 Acres', 'Above 3 Acres'].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <button type="button" className="marketplace-more-filters" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <Icon kind="filter" /> More Filters
          </button>
          <button type="button" className="marketplace-reset" onClick={resetFilters}>Reset</button>
        </div>
        {showFilters ? (
          <div className="marketplace-more-panel">
            <p>Additional filters such as zoning, road access width, and seller verification tier would appear here once connected to a real backend. This demo filters only by type, price, and area.</p>
          </div>
        ) : null}
      </section>

      <section className="marketplace-results">
        <div className="marketplace-results__head">
          <h2>{filtered.length} Verified Listings</h2>
          <div className="marketplace-results__controls">
            <label className="marketplace-sort">
              <span>Sort by</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <div className="marketplace-toggle" role="group" aria-label="Switch between list and map view">
              <button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon kind="list" /> List View</button>
              <button type="button" className={view === 'map' ? 'is-active' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}><Icon kind="map" /> Map View</button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="marketplace-empty">No listings match your filters yet. Try resetting filters above.</p>
        ) : view === 'list' ? (
          <div className="marketplace-grid">
            {filtered.map((item) => (
              <ListingCard key={item.id} listing={item} saved={savedIds.has(item.id)} onToggleSave={onToggleSave} onOpen={onOpenListing} />
            ))}
          </div>
        ) : (
          <div className="marketplace-map-layout">
            <div className="marketplace-map-list">
              {filtered.map((item) => (
                <ListingRow key={item.id} listing={item} saved={savedIds.has(item.id)} onToggleSave={onToggleSave} onOpen={onOpenListing} />
              ))}
            </div>
            <div className="marketplace-map">
              <SchematicMap listings={filtered} selectedId={selectedPin} onSelectPin={setSelectedPin} className="marketplace-map__svg" />
              <p className="marketplace-map__note">Showing {filtered.length} properties in this demo area. Pins are schematic, not satellite imagery.</p>
              {selectedPin ? (() => {
                const pin = filtered.find((f) => f.id === selectedPin);
                return pin ? (
                  <div className="marketplace-map__card">
                    <strong>{pin.title}</strong>
                    <span>{pin.location}</span>
                    <button type="button" onClick={() => onOpenListing(pin.id)}>View details</button>
                  </div>
                ) : null;
              })() : null}
            </div>
          </div>
        )}
      </section>
    </BuyerLayout>
  );
}
