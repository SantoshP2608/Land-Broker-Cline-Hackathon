import React, { useEffect, useState } from 'react';
import { Badge, Button, Icon, Modal } from '../seller/SellerUI.jsx';
import '../seller/ReviewSellerLayout.css';
import './TransactionLayout.css';

const sidebar = [['home', 'Dashboard', '/buyer/dashboard'], ['search', 'Browse Lands', '/marketplace'], ['file', 'My Requests', '/buyer/requests'], ['file', 'Transactions', '/transactions'], ['user', 'Profile', '/profile'], ['edit', 'Settings', '/settings']];
export default function TransactionLayout({ children, path, onNavigate }) {
  const [menu, setMenu] = useState(false);
  const [handoff, setHandoff] = useState('');
  useEffect(() => { setMenu(false); }, [path]);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  function link(event, target) { event.preventDefault(); onNavigate(target); }
  return <div className="transaction-layout">
    <a className="ls-skip" href="#transaction-main">Skip to content</a>
    <header className="tx-header">
      <a href="/" className="tx-brand" onClick={event => link(event, '/')} aria-label="LandShield homepage"><Icon name="shield" size={56} /><span><strong>Land<span>Shield</span></strong><small>PROPERTY DOCUMENT VERIFICATION</small></span></a>
      <nav className="tx-topnav" aria-label="Primary navigation">{[['Dashboard', '/buyer/dashboard'], ['My Listings', '/seller/listings/LS-2041'], ['Verification', '/page-6'], ['Buyer Requests', '/seller/buyer-requests'], ['Transactions', '/transactions']].map(([label, target]) => <a key={label} href={target} className={label === 'Transactions' ? 'active' : ''} aria-current={label === 'Transactions' ? 'page' : undefined} onClick={event => link(event, target)}>{label}</a>)}</nav>
      <div className="tx-header-actions"><Button className="tx-notification" aria-label="View notifications" onClick={() => setHandoff('Notifications')}><Icon name="info" size={24} /><i /></Button><Button className="tx-profile" aria-label="Open buyer profile" onClick={() => setHandoff('Buyer profile')}><span className="tx-avatar">R</span><span>Ravi Kumar<small>Buyer</small></span><Icon name="chevron" size={16} /></Button><Button className="tx-menu-toggle" aria-label="Toggle transaction navigation" aria-expanded={menu} aria-controls="transaction-sidebar" onClick={() => setMenu(!menu)}><Icon name="menu" /></Button></div>
    </header>
    {menu && <button className="tx-menu-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside id="transaction-sidebar" className={`tx-sidebar ${menu ? 'is-open' : ''}`}><nav aria-label="Buyer navigation">{sidebar.map(([icon, label, target]) => <a key={label} href={target} className={label === 'Transactions' ? 'active' : ''} aria-current={label === 'Transactions' ? 'page' : undefined} onClick={event => link(event, target)}><Icon name={icon} size={25} />{label}</a>)}</nav><Button className="tx-switch" onClick={() => setHandoff('Switch to selling mode')}><Icon name="switch" size={24} /><span>Switch to<br />Selling Mode</span></Button></aside>
    <main id="transaction-main" className="tx-main"><div className="tx-demo-notice"><Badge tone="success">LOCAL DEMO</Badge><span>Synthetic design fixtures · No real payments, government registration or ownership transfer. Changes reset on reload.</span></div>{children}</main>
    <Modal open={Boolean(handoff)} title={handoff} onClose={() => setHandoff('')}><p>This action belongs to the shared account flow. No role, notification, or backend record has been changed.</p><p>Transaction previews 12 and 13 are available locally. All names, land details and documents are synthetic.</p></Modal>
  </div>;
}