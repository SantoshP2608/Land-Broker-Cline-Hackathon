import React, { useEffect, useRef, useState } from 'react';
import HomeLeft from '../features/home/HomeLeft.jsx';
import Navbar from '../features/home/Navbar.jsx';
import AuthPage from '../features/account/AuthPage.jsx';
import ProfilePage from '../features/account/ProfilePage.jsx';
import SellerLayout from '../features/seller/SellerLayout.jsx';
import ListingManagement from '../features/seller/ListingManagement.jsx';
import BuyerRequests from '../features/seller/BuyerRequests.jsx';
import { createSellerService, sellerMode } from '../features/seller/seller-service.mjs';
import { Button, Panel } from '../features/seller/SellerUI.jsx';
import TransactionLayout from '../features/transactions/TransactionLayout.jsx';
import AgreementPreparation from '../features/transactions/AgreementPreparation.jsx';
import CancellationResolution from '../features/transactions/CancellationResolution.jsx';
import { createTransactionService } from '../features/transactions/transaction-service.mjs';
import '../features/account/account.css';
import './App.css';

const panels = {
  workflow: ['How verification works', 'Submit property details and sample evidence, review extracted findings, correct missing documents, and request a human review before publication. Document comparison does not guarantee legal title.'],
  about: ['About this platform', 'LandShield supports a shared, traceable review of property documents before registration. This prototype uses synthetic records, not live government records.'],
  help: ['Help & support', 'Use sample details only. Enter any sample email and a made-up password of at least eight characters to explore the profile page. Select sample PDF, JPG, or PNG evidence up to 10 MB. No information is sent to a server.'],
  reset: ['Password recovery', 'Password recovery is not connected. This frontend demo has no stored accounts or passwords. You can continue with a sample email and any made-up password of at least eight characters.'],
  terms: ['Demo terms', 'This prototype is for demonstration with sample data only. It provides no real authentication, identity approval, legal title guarantee, or government integration.'],
  privacy: ['Demo privacy', 'Account details, drafts, and selected sample evidence remain in page memory only. They are not uploaded or saved to browser storage. Refresh or sign out to clear the session. Do not enter real identity numbers or credentials.'],
  marketplace: ['Marketplace preview', 'Marketplace listings are not integrated yet. Identity evidence in this demo does not grant listing or purchasing eligibility.'],
  transactions: ['My transactions preview', 'Agreement and cancellation stages are available as independent synthetic previews. No purchases, sales, reservations, or legal commitments are created in this demo.'],
  settings: ['Settings preview', 'Account settings are not integrated yet. You can switch buying/selling context from the header or sign out to clear the demo session.'],
};
function currentPage() {
  if (window.location.hash === '#signin') return 'signin';
  if (window.location.hash === '#profile') return 'profile';
  if (['/page-2', '/signin'].includes(window.location.pathname)) return 'signin';
  if (['/page-3', '/profile'].includes(window.location.pathname)) return 'profile';
  return 'home';
}
export default function App() {
  const dialogRef = useRef(null);
  const [panel, setPanel] = useState('workflow');
  const [page, setPage] = useState(currentPage);
  const [path, setPath] = useState(window.location.pathname);
  const [service] = useState(() => createSellerService({ mode: sellerMode, baseUrl: import.meta.env.VITE_API_BASE_URL || '' }));
  const [transactionService] = useState(() => createTransactionService({ mode: 'demo' }));
  const [account, setAccount] = useState(null);
  const [journey, setJourney] = useState('buying');
  useEffect(() => {
    function updateRoute() { setPath(window.location.pathname); setPage(currentPage()); }
    window.addEventListener('hashchange', updateRoute);
    window.addEventListener('popstate', updateRoute);
    return () => { window.removeEventListener('hashchange', updateRoute); window.removeEventListener('popstate', updateRoute); };
  }, []);
  useEffect(() => {
    const title = path.startsWith('/transactions') || ['/page-12', '/page-13'].includes(path) ? 'Transaction previews' : path.startsWith('/seller') || ['/page-6', '/page-7'].includes(path) ? 'Seller previews' : page === 'home' ? 'Property document review' : page === 'signin' ? 'Sign in' : 'Profile & Identity Verification';
    document.title = `${title} | LandShield`;
    if (page !== 'home' || path !== '/') window.scrollTo(0, 0);
  }, [page, path]);
  function navigate(target) {
    if (dialogRef.current?.open) dialogRef.current.close();
    window.history.pushState({}, '', target);
    setPath(window.location.pathname);
    setPage(currentPage());
    window.scrollTo(0, 0);
  }
  function openPanel(nextPanel) {
    if (nextPanel === 'demo' || nextPanel === 'signin') { window.location.hash = 'signin'; return; }
    setPanel(nextPanel);
    dialogRef.current.showModal();
  }
  function continueDemo(details) { setAccount(details); window.location.hash = 'profile'; }
  function signOut() { setAccount(null); setJourney('buying'); window.location.hash = 'signin'; }
  const agreementPage = path === '/page-12' || path === '/transactions/TRX-2025-1043/agreement';
  const cancellationPage = path === '/page-13' || path === '/transactions/TRX-2025-1043/cancellation';
  if (agreementPage || cancellationPage || path === '/transactions' || path === '/transactions/TRX-2025-1043') {
    return <TransactionLayout path={path} onNavigate={navigate}>
      {agreementPage ? <AgreementPreparation service={transactionService} onNavigate={navigate} /> : cancellationPage ? <CancellationResolution service={transactionService} onNavigate={navigate} /> : <Panel className="tx-preview-hub"><h1>Transaction previews</h1><p>Choose a screenshot-derived stage. These are independent synthetic fixtures, not successive states of one live transaction.</p><p className="ls-muted">Agreement preparation and cancellation review do not change one another. No backend commands, payments, escrow or registration are performed.</p><div className="ls-dialog-actions"><Button variant="primary" onClick={() => navigate('/transactions/TRX-2025-1043/agreement')}>Page 12 · Agreement preparation</Button><Button onClick={() => navigate('/transactions/TRX-2025-1043/cancellation')}>Page 13 · Cancellation & resolution</Button></div></Panel>}
    </TransactionLayout>;
  }
  if (path !== '/' && !['/page-2', '/signin', '/page-3', '/profile'].includes(path)) {
    const buyerPage = path === '/seller/buyer-requests' || path === '/page-7';
    const listingPage = path.startsWith('/seller/listings') || path === '/page-6';
    const listingId = path.startsWith('/seller/listings/') ? decodeURIComponent(path.split('/')[3] || 'LS-2041') : 'LS-2041';
    return <SellerLayout path={buyerPage ? '/seller/buyer-requests' : path === '/page-6' ? '/seller/listings/LS-2041' : path} onNavigate={navigate} mode={sellerMode}>
      {buyerPage ? <BuyerRequests service={service} onNavigate={navigate} /> : listingPage ? <ListingManagement key={listingId} service={service} listingId={listingId} /> : <Panel className="seller-handoff"><h1>Frontend integration handoff</h1><p className="ls-muted">This route ({path}) belongs to another teammate’s page. It has not been implemented or simulated here.</p><p>Use the available synthetic seller and transaction previews. Navigation does not complete a backend workflow.</p><div className="ls-dialog-actions"><Button onClick={() => navigate('/seller/listings/LS-2041')}>Page 6 · Listing review</Button><Button variant="primary" onClick={() => navigate('/seller/buyer-requests')}>Page 7 · Buyer requests</Button><Button onClick={() => navigate('/transactions')}>Transaction previews</Button></div></Panel>}
    </SellerLayout>;
  }
  const [title, description] = panels[panel] || panels.help;
  return <>
    {page === 'home' ? <>
      <Navbar onOpenPanel={openPanel} />
      <main id="home"><HomeLeft backgroundImage="/assets/Main-hero.png" featureIcons={{ trusted: '/assets/assurance.png', extraction: '/assets/ai-verf.png', comparison: '/assets/doc-search.png', transparency: '/assets/human-shield.png' }} onTryDemo={() => openPanel('demo')} onWatchHowItWorks={() => openPanel('workflow')} /></main>
    </> : page === 'signin' ? <AuthPage onContinue={continueDemo} journey={journey} onJourneyChange={setJourney} onOpenPanel={openPanel} /> : <ProfilePage account={account} journey={journey} onJourneyChange={setJourney} onSignOut={signOut} onOpenPanel={openPanel} />}
    <dialog ref={dialogRef} className="home-preview-dialog" aria-labelledby="preview-title">
      <form method="dialog"><button className="home-preview-dialog__close" aria-label="Close dialog">×</button></form>
      <p className="home-preview-dialog__eyebrow">LANDSHIELD DEMONSTRATION</p>
      <h2 id="preview-title">{title}</h2><p>{description}</p>
      {['about', 'transactions'].includes(panel) && <nav aria-label="Available page previews"><p><button className="home-seller-link" onClick={() => navigate('/page-6')}>Open page 6 · Listing verification</button></p><p><button className="home-seller-link" onClick={() => navigate('/page-7')}>Open page 7 · Buyer requests</button></p><p><button className="home-seller-link" onClick={() => navigate('/page-12')}>Open page 12 · Agreement preparation</button></p><p><button className="home-seller-link" onClick={() => navigate('/page-13')}>Open page 13 · Cancellation & resolution</button></p></nav>}
      <p className="home-preview-dialog__note">DEMONSTRATION — SIMULATED GOVERNMENT RECORDS. No backend services are connected.</p>
    </dialog>
  </>;
}
