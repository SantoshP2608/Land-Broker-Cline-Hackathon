import React from 'react';
import { Icon } from './icons.jsx';
import './BuyerLayout.css';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'marketplace', label: 'Browse Lands', icon: 'search' },
  { key: 'requests', label: 'My Requests', icon: 'requests' },
  { key: 'transactions', label: 'Transactions', icon: 'transactions' },
];

const TOP_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'marketplace', label: 'Browse Lands' },
  { key: 'requests', label: 'My Requests' },
  { key: 'transactions', label: 'Transactions' },
];

/**
 * Shared chrome for the buyer experience: top bar + sidebar.
 * Purely presentational — no backend calls, no persisted navigation state.
 */
export default function BuyerLayout({ active, onNavigate, onSwitchToSelling, onGoHome, onProfile, badges = {}, userName = 'Ravi Kumar', account, onSignIn, children }) {
  const initial = (account?.name || userName || 'G').charAt(0).toUpperCase();
  return (
    <div className="buyer-shell">
      <header className="buyer-topbar">
        <button type="button" className="buyer-topbar__brand" onClick={onGoHome} aria-label="Go to home">
          <span className="buyer-topbar__brand-icon"><Icon kind="land-home" /></span>
          <span className="buyer-topbar__brand-text">
            <span className="buyer-topbar__brand-name">LandShield</span>
            <span className="buyer-topbar__brand-tag">PROPERTY DOCUMENT VERIFICATION</span>
          </span>
        </button>
        <nav className="buyer-topbar__nav" aria-label="Buyer sections">
          {TOP_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`buyer-topbar__link${active === item.key ? ' buyer-topbar__link--active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
              onClick={() => onNavigate?.(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="buyer-topbar__actions">
          <button type="button" className="buyer-topbar__bell" aria-label="Notifications">
            <Icon kind="bell" />
            <span className="buyer-topbar__bell-dot" aria-hidden="true" />
          </button>
          {account ? (
            <button type="button" className="buyer-topbar__user" onClick={onProfile}>
              <span className="buyer-topbar__avatar">{initial}</span>
              <span className="buyer-topbar__user-text">
                <span className="buyer-topbar__user-name">{account?.name || userName}</span>
                <span className="buyer-topbar__user-role">Buyer</span>
              </span>
              <Icon kind="chevron-down" />
            </button>
          ) : (
            <button type="button" className="buyer-topbar__signin" onClick={onSignIn}>Sign in</button>
          )}
        </div>
      </header>

      <div className="buyer-body">
        <aside className="buyer-sidebar" aria-label="Buyer navigation">
          <nav className="buyer-sidebar__nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`buyer-sidebar__link${active === item.key ? ' buyer-sidebar__link--active' : ''}`}
                aria-current={active === item.key ? 'page' : undefined}
                onClick={() => onNavigate?.(item.key)}
              >
                <Icon kind={item.icon} />
                <span>{item.label}</span>
                {badges[item.key] ? <span className="buyer-sidebar__badge">{badges[item.key]}</span> : null}
              </button>
            ))}
          </nav>
          <div className="buyer-sidebar__footer">
            <button type="button" className="buyer-sidebar__link" onClick={onProfile}>
              <Icon kind="profile" />
              <span>Profile</span>
            </button>
            <button type="button" className="buyer-sidebar__link" onClick={() => onNavigate?.('settings')}>
              <Icon kind="settings" />
              <span>Settings</span>
            </button>
            <button type="button" className="buyer-sidebar__switch" onClick={onSwitchToSelling}>
              <Icon kind="switch" />
              <span>Switch to<br />Selling Mode</span>
            </button>
          </div>
        </aside>

        <main className="buyer-main">{children}</main>
      </div>
    </div>
  );
}
