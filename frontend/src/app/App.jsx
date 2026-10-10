import React, { useRef, useState } from 'react';
import HomeLeft from '../features/home/HomeLeft.jsx';
import Navbar from '../features/home/Navbar.jsx';
import './App.css';

export default function App() {
  const dialogRef = useRef(null);
  const [panel, setPanel] = useState('demo');

  function openPanel(nextPanel) {
    setPanel(nextPanel);
    dialogRef.current.showModal();
  }

  return (
    <>
      <Navbar onOpenPanel={openPanel} />
      <main id="home">
        <HomeLeft
          backgroundImage="/assets/Main-hero.png"
          featureIcons={{
            trusted: '/assets/assurance.png',
            extraction: '/assets/ai-verf.png',
            comparison: '/assets/doc-search.png',
            transparency: '/assets/human-shield.png',
          }}
          onTryDemo={() => openPanel('demo')}
          onWatchHowItWorks={() => openPanel('workflow')}
        />
      </main>
      <dialog ref={dialogRef} className="home-preview-dialog" aria-labelledby="preview-title">
        <form method="dialog">
          <button className="home-preview-dialog__close" aria-label="Close dialog">×</button>
        </form>
        <p className="home-preview-dialog__eyebrow">LANDSHIELD DEMONSTRATION</p>
        <h2 id="preview-title">{{ demo: 'Your journey starts here', workflow: 'How verification works', about: 'About this platform', signin: 'Sign in preview' }[panel]}</h2>
        {panel === 'about' ? (
          <p>This AI-assisted platform compares property documents, highlights discrepancies and missing evidence, and gives buyers and sellers a shared, traceable review before registration. This preview uses sample data, not live government records.</p>
        ) : panel === 'signin' ? (
          <p>Buyer and seller sign-in is not connected in this homepage preview. No credentials are collected. Authentication will be available when the account flows are integrated.</p>
        ) : panel === 'demo' ? (
          <p>This is the homepage preview. Seller and buyer login flows are not connected yet. This demonstration uses synthetic records, not live government verification.</p>
        ) : (
          <ol>
            <li>Submit property details and supporting documents.</li>
            <li>Review extracted details, discrepancies, and missing evidence.</li>
            <li>Correct documents and obtain the required review before publication.</li>
            <li>Buyer and seller review shared findings before proceeding.</li>
          </ol>
        )}
        <p className="home-preview-dialog__note">Document comparison supports review; it does not guarantee legal title or replace registration decisions.</p>
      </dialog>
    </>
  );
}
