import React from 'react';
import SellerLayout from './SellerLayout.jsx';
import { Icon } from './icons.jsx';
import './SellerDashboard.css';

// Synthetic demo data only — no backend is connected yet. Replace with API responses later.
const STATS = [
  { key: 'total', label: 'Total Listings', value: 3, icon: 'listings', tone: 'blue' },
  { key: 'approved', label: 'Approved', value: 1, icon: 'check', tone: 'green' },
  { key: 'pending', label: 'Under Verification', value: 1, icon: 'clock', tone: 'amber' },
  { key: 'requests', label: 'Buyer Requests', value: 4, icon: 'requests', tone: 'purple' },
];

const LISTINGS = [
  {
    id: 'land-1',
    title: 'Agricultural Land',
    location: 'Rangareddy, Telangana',
    area: '2.5 Acres',
    price: '45,00,000',
    priceUnit: 'per acre',
    status: 'approved',
  },
  {
    id: 'land-2',
    title: 'Residential Plot',
    location: 'Narsingi, Hyderabad',
    area: '600 Sq. Yards',
    price: '1,20,00,000',
    priceUnit: 'total',
    status: 'verifying',
  },
  {
    id: 'land-3',
    title: 'Commercial Land',
    location: 'Shamshabad, Hyderabad',
    area: '1.0 Acre',
    price: '75,00,000',
    priceUnit: 'per acre',
    status: 'draft',
  },
];

const BUYER_REQUESTS = [
  { id: 'req-1', name: 'Arjun Mehta', interest: 'Interested in Agricultural Land', when: '2 hours ago' },
  { id: 'req-2', name: 'Sneha Reddy', interest: 'Interested in Residential Plot', when: '1 day ago' },
  { id: 'req-3', name: 'Vikram Singh', interest: 'Interested in Commercial Land', when: '2 days ago' },
];

const VERIFICATION_STEPS = [
  { key: 'submitted', label: 'Documents Submitted', icon: 'draft', state: 'done' },
  { key: 'ai', label: 'AI Verification in Progress', icon: 'verification', state: 'active' },
  { key: 'review', label: 'Department Review', icon: 'requests', state: 'upcoming' },
  { key: 'approval', label: 'Approval', icon: 'check', state: 'upcoming' },
  { key: 'published', label: 'Published', icon: 'listings', state: 'upcoming' },
];

const STATUS_META = {
  approved: { label: 'Approved', icon: 'check', className: 'status-pill--approved' },
  verifying: { label: 'Under Verification', icon: 'clock', className: 'status-pill--verifying' },
  draft: { label: 'Draft', icon: 'draft', className: 'status-pill--draft' },
};

function StatCard({ label, value, icon, tone }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <span className="stat-card__icon"><Icon kind={icon} /></span>
      <span className="stat-card__text">
        <span className="stat-card__value">{value}</span>
        <span className="stat-card__label">{label}</span>
      </span>
      <Icon kind="chevron-right" />
    </div>
  );
}

function ListingRow({ listing, onOpen }) {
  const meta = STATUS_META[listing.status];
  return (
    <button type="button" className="listing-row" onClick={() => onOpen?.(listing.id)}>
      <span className="listing-row__thumb" aria-hidden="true"><Icon kind="land-home" /></span>
      <span className="listing-row__info">
        <span className="listing-row__title">{listing.title}</span>
        <span className="listing-row__meta"><Icon kind="pin" /> {listing.location} &nbsp;·&nbsp; {listing.area}</span>
      </span>
      <span className="listing-row__price">
        ₹ {listing.price}
        <span className="listing-row__price-unit">({listing.priceUnit})</span>
      </span>
      <span className={`status-pill ${meta.className}`}><Icon kind={meta.icon} /> {meta.label}</span>
      <Icon kind="chevron-right" />
    </button>
  );
}

function RequestRow({ request, onAccept, onDecline }) {
  return (
    <div className="request-row">
      <span className="request-row__avatar">{request.name.charAt(0)}</span>
      <span className="request-row__info">
        <span className="request-row__name">{request.name}</span>
        <span className="request-row__interest">{request.interest}</span>
      </span>
      <span className="request-row__when">{request.when}</span>
      <span className="request-row__actions">
        <button type="button" className="request-row__accept" onClick={() => onAccept?.(request.id)}>Accept</button>
        <button type="button" className="request-row__decline" onClick={() => onDecline?.(request.id)}>Decline</button>
      </span>
      <Icon kind="chevron-right" />
    </div>
  );
}

/**
 * Page 4 — Seller Dashboard.
 * All data shown is synthetic demo data; accept/decline and navigation handlers
 * are supplied by the parent and must be wired to real APIs before launch.
 */
export default function SellerDashboard({
  userName = 'Ravi Kumar',
  onNavigate,
  onSwitchToBuying,
  onGoHome,
  onListMyLand,
  onOpenListing,
  onAcceptRequest,
  onDeclineRequest,
}) {
  const [first, last = ''] = userName.split(' ');
  return (
    <SellerLayout
      active="dashboard"
      userName={userName}
      onNavigate={onNavigate}
      onSwitchToBuying={onSwitchToBuying}
      onGoHome={onGoHome}
      badges={{ requests: BUYER_REQUESTS.length }}
    >
      <section className="dashboard-hero">
        <div className="dashboard-hero__text">
          <h1>Welcome back, <span className="dashboard-hero__name">{first} {last}</span> <span aria-hidden="true">👋</span></h1>
          <p>Manage your land listings, track verification status, and connect with genuine buyers.</p>
        </div>
        <button type="button" className="dashboard-hero__cta" onClick={onListMyLand}>
          <span className="dashboard-hero__cta-icon"><Icon kind="plus" /></span>
          <span className="dashboard-hero__cta-text">
            <span>List My Land</span>
            <small>Submit for verification</small>
          </span>
          <Icon kind="arrow-right" />
        </button>
      </section>

      <section className="stat-grid" aria-label="Listing summary">
        {STATS.map((stat) => <StatCard key={stat.key} {...stat} />)}
      </section>

      <section className="dashboard-columns">
        <div className="panel">
          <div className="panel__header">
            <h2>My Land Listings</h2>
            <button type="button" className="panel__view-all" onClick={() => onNavigate?.('listings')}>View All <Icon kind="arrow-right" /></button>
          </div>
          <div className="panel__body">
            {LISTINGS.map((listing) => <ListingRow key={listing.id} listing={listing} onOpen={onOpenListing} />)}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>Recent Buyer Requests</h2>
            <button type="button" className="panel__view-all" onClick={() => onNavigate?.('requests')}>View All <Icon kind="arrow-right" /></button>
          </div>
          <div className="panel__body">
            {BUYER_REQUESTS.map((request) => (
              <RequestRow key={request.id} request={request} onAccept={onAcceptRequest} onDecline={onDeclineRequest} />
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-footer">
        <div className="panel verification-panel">
          <div className="panel__header">
            <h2>Verification Progress</h2>
            <button type="button" className="panel__view-all" onClick={() => onNavigate?.('verification')}>View Details <Icon kind="arrow-right" /></button>
          </div>
          <ol className="verification-steps">
            {VERIFICATION_STEPS.map((step) => (
              <li key={step.key} className={`verification-step verification-step--${step.state}`}>
                <span className="verification-step__icon"><Icon kind={step.icon} /></span>
                <span>{step.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="help-card">
          <span className="help-card__icon"><Icon kind="verification" /></span>
          <div className="help-card__text">
            <h3>Need Help?</h3>
            <p>Follow our step-by-step guide to list your land and complete verification.</p>
            <button type="button" className="help-card__link">View Guide <Icon kind="arrow-right" /></button>
          </div>
        </div>
      </section>
    </SellerLayout>
  );
}
