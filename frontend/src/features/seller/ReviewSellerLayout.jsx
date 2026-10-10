import React, { useEffect, useState } from 'react';
import { Badge, Button, Icon, Modal } from './SellerUI.jsx';
import './ReviewSellerLayout.css';

const navigation = [
  ['home', 'Seller dashboard', '/seller/dashboard'],
  ['list', 'My listings', '/seller/listings/LS-2041'],
  ['users', 'Buyer requests', '/seller/buyer-requests'],
  ['file', 'Transactions', '/transactions'],
  ['user', 'My profile', '/profile'],
];

export default function ReviewSellerLayout({ children, path, onNavigate, mode }) {
  const [menu, setMenu] = useState(false);
  const [handoff, setHandoff] = useState(null);
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    function close(event) { if (event.key === 'Escape') setMenu(false); }
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  function navigate(event, target) { event.preventDefault(); onNavigate(target); }
  return <div className="review-seller-layout">
    <a className="ls-skip" href="#review-seller-main">Skip to content</a>
    <header className="review-seller-header">
      <a className="review-seller-brand" href="/" onClick={event => navigate(event, '/')} aria-label="LandShield homepage">
        <span className="review-seller-brand__mark"><Icon name="shield" size={54} /></span>
        <span><strong>Land<span>Shield</span></strong><small>PROPERTY DOCUMENT VERIFICATION</small></span>
      </a>
      <nav className="review-seller-topnav" aria-label="Primary navigation">
        <a href="/seller/listings/LS-2041" className="active" onClick={event => navigate(event, '/seller/listings/LS-2041')}>Dashboard</a>
        <a href="/marketplace" onClick={event => navigate(event, '/marketplace')}>Marketplace</a>
        <a href="/transactions" onClick={event => navigate(event, '/transactions')}>My transactions</a>
      </nav>
      <div className="review-seller-header__actions">
        <Button onClick={() => setHandoff('Switch to buying')}><Icon name="switch" /> <span>Switch to buying</span></Button>
        <Button className="review-seller-profile" onClick={() => setHandoff('Seller profile')} aria-label="Open seller profile"><span className="ls-avatar">SP</span><Icon name="chevron" size={16} /></Button>
        <Button className="review-seller-menu-toggle" aria-label="Toggle seller navigation" aria-expanded={menu} aria-controls="review-seller-sidebar" onClick={() => setMenu(!menu)}><Icon name="menu" /></Button>
      </div>
    </header>
    {menu && <button className="review-seller-menu-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside id="review-seller-sidebar" className={`review-seller-sidebar ${menu ? 'is-open' : ''}`}>
      <nav aria-label="Seller navigation">{navigation.map(([icon, label, target]) => {
        const active = target.includes('listings') ? path.includes('/listings') : path === target;
        return <a key={target} href={target} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={event => navigate(event, target)}><Icon name={icon} size={26} />{label}</a>;
      })}</nav>
      <div className="review-seller-sidebar__bottom"><Button onClick={() => setHandoff('Help & support')}><Icon name="help" size={24} />Help & support</Button><p><strong>LandShield</strong><span>·</span> Demo platform</p></div>
    </aside>
    <main id="review-seller-main" className="review-seller-main">
      <div className="review-seller-demo-notice"><span className="review-seller-demo-notice__label"><i />DEMO VERSION</span><span>{mode === 'api' ? 'Backend connected · SIMULATED government records and identity checks.' : 'Synthetic preview data · SIMULATED government records. No real registration or ownership transfer.'}</span></div>
      {children}
    </main>
    <Modal open={Boolean(handoff)} title={handoff || ''} onClose={() => setHandoff(null)}>
      <p>This screen belongs to another frontend flow. Pages 6 and 7 are available here; no account role or backend state has been changed.</p>
      <p className="ls-muted">Use only synthetic documents in this demonstration. Document checks do not guarantee legal title.</p>
      <Badge tone="info">{mode === 'api' ? 'Backend mode' : 'Local preview mode'}</Badge>
    </Modal>
  </div>;
}