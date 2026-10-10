import React from 'react';
import { Icon } from './icons.jsx';
import './SellerLayout.css';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'listings', label: 'My Listings', icon: 'listings' },
  { key: 'verification', label: 'Verification', icon: 'verification' },
  { key: 'requests', label: 'Buyer Requests', icon: 'requests' },
  { key: 'transactions', label: 'Transactions', icon: 'transactions' },
];

const TOP_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'listings', label: 'My Listings' },
  { key: 'verification', label: 'Verification' },
  { key: 'requests', label: 'Buyer Requests' },
  { key: 'transactions', label: 'Transactions' },
];

/**
 * Shared chrome for the seller experience: top bar + sidebar.
 * `active` selects the highlighted nav entry; `onNavigate(key)` requests a page change.
 * Purely presentational — no backend calls, no persisted navigation state.
 */
export default function SellerLayout({ active, onNavigate, onSwitchToBuying, onGoHome, badges = {}, userName = 'Ravi Kumar', children }) {
  return (
    <div className="seller-shell">
      <header className="seller-topbar">
        <button type="button" className="seller-topbar__brand" onClick={onGoHome} aria-label="Go to home">
          <span className="seller-topbar__brand-icon"><Icon kind="land-home" /></span>
          <span className="seller-topbar__brand-text">
            <span className="seller-topbar__brand-name">LandShield</span>
            <span className="seller-topbar__brand-tag">PROPERTY DOCUMENT VERIFICATION</span>
          </span>
        </button>
        <nav className="seller-topbar__nav" aria-label="Seller sections">
          {TOP_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`seller-topbar__link${active === item.key ? ' seller-topbar__link--active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
              onClick={() => onNavigate?.(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="seller-topbar__actions">
          <button type="button" className="seller-topbar__bell" aria-label="Notifications">
            <Icon kind="bell" />
            <span className="seller-topbar__bell-dot" aria-hidden="true" />
          </button>
          <button type="button" className="seller-topbar__user">
            <span className="seller-topbar__avatar">{userName.charAt(0)}</span>
            <span className="seller-topbar__user-text">
              <span className="seller-topbar__user-name">{userName}</span>
              <span className="seller-topbar__user-role">Seller</span>
            </span>
            <Icon kind="chevron-down" />
          </button>
        </div>
      </header>

      <div className="seller-body">
        <aside className="seller-sidebar" aria-label="Seller navigation">
          <nav className="seller-sidebar__nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`seller-sidebar__link${active === item.key ? ' seller-sidebar__link--active' : ''}`}
                aria-current={active === item.key ? 'page' : undefined}
                onClick={() => onNavigate?.(item.key)}
              >
                <Icon kind={item.icon} />
                <span>{item.label}</span>
                {badges[item.key] ? <span className="seller-sidebar__badge">{badges[item.key]}</span> : null}
              </button>
            ))}
          </nav>
          <div className="seller-sidebar__footer">
            <button type="button" className="seller-sidebar__link" onClick={() => onNavigate?.('profile')}>
              <Icon kind="profile" />
              <span>Profile</span>
            </button>
            <button type="button" className="seller-sidebar__link" onClick={() => onNavigate?.('settings')}>
              <Icon kind="settings" />
              <span>Settings</span>
            </button>
            <button type="button" className="seller-sidebar__switch" onClick={onSwitchToBuying}>
              <Icon kind="switch" />
              <span>Switch to<br />Buying Mode</span>
            </button>
          </div>
        </aside>

        <main className="seller-main">{children}</main>
      </div>
    </div>
  );
}
