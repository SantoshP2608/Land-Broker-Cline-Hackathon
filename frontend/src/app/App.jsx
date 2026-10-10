import React, { useEffect, useRef, useState } from 'react';
import HomeLeft from '../features/home/HomeLeft.jsx';
import Navbar from '../features/home/Navbar.jsx';
import AuthPage from '../features/account/AuthPage.jsx';
import ProfilePage from '../features/account/ProfilePage.jsx';
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
  transactions: ['My transactions preview', 'Transaction tracking is not integrated yet. No purchases, sales, reservations, or legal commitments are created in this demo.'],
  settings: ['Settings preview', 'Account settings are not integrated yet. You can switch buying/selling context from the header or sign out to clear the demo session.'],
};
function currentPage() {
  return window.location.hash === '#signin' ? 'signin' : window.location.hash === '#profile' ? 'profile' : 'home';
}
export default function App() {
  const dialogRef = useRef(null);
  const [panel, setPanel] = useState('workflow');
  const [page, setPage] = useState(currentPage);
  const [account, setAccount] = useState(null);
  const [journey, setJourney] = useState('buying');
  useEffect(() => {
    function navigate() { setPage(currentPage()); }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    document.title = `${page === 'home' ? 'Property document review' : page === 'signin' ? 'Sign in' : 'Profile & Identity Verification'} | LandShield`;
    if (page !== 'home') window.scrollTo(0, 0);
  }, [page]);
  function openPanel(nextPanel) {
    if (nextPanel === 'demo' || nextPanel === 'signin') { window.location.hash = 'signin'; return; }
    setPanel(nextPanel);
    dialogRef.current.showModal();
  }
  function continueDemo(details) { setAccount(details); window.location.hash = 'profile'; }
  function signOut() { setAccount(null); setJourney('buying'); window.location.hash = 'signin'; }
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
      <p className="home-preview-dialog__note">DEMONSTRATION — SIMULATED GOVERNMENT RECORDS. No backend services are connected.</p>
    </dialog>
  </>;
}
