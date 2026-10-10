import React, { useState } from 'react';
import SellerLayout from '../seller/SellerLayout.jsx';
import './OutcomePage.css';

const documents = ['Registered Sale Deed (Final)', 'Encumbrance Certificate (Updated)', 'Registration Certificate', 'Mutation Record (ROR / Pahani)', 'Survey Map (Final)'];
const milestones = ['Request Accepted', 'Document Verification', 'Agreement Preparation', 'Registration Process', 'Completed'];
export default function OutcomePage() {
  const [cancelled, setCancelled] = useState(false);
  const [message, setMessage] = useState('');
  function download(name) {
    const text = `LANDSHIELD — SYNTHETIC DEMO REPORT\n${name}\nTransaction TRX-2025-1043\nOutcome: ${cancelled ? 'Cancelled and safely released (simulated)' : 'Simulated registration completion'}\nNo legal ownership transfer or government registration occurred.\nPrevious seller: Suresh Reddy. New owner in sample scenario: Ravi Kumar.\nHistory: request accepted, documents reviewed, agreement prepared, registrar demo outcome recorded.\nThis text report is not a registered deed or government certificate.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a'); link.href = url; link.download = 'landshield-demo-report.txt'; link.click(); URL.revokeObjectURL(url);
    setMessage('Downloaded a labelled demo text report, not an official document.');
  }
  const navigate = (key) => { if (key === 'dashboard') window.location.hash = 'seller-dashboard'; else if (key === 'listings') window.location.hash = 'seller-list-land'; else if (key === 'profile') window.location.hash = 'profile'; else setMessage('Transaction history for this sample is shown below; other workflows are not connected.'); };
  return <SellerLayout active="transactions" onNavigate={navigate} onGoHome={() => { window.location.hash = 'home'; }} onSwitchToBuying={() => { window.location.hash = 'marketplace'; }}>
    <div className="outcome-demo">DEMO OUTCOME • Synthetic records only. No legal transfer or government registration.</div>
    <a href="#marketplace">← Back to listings</a>
    <header className="outcome-heading"><div><h1>Transaction <span>{cancelled ? 'Cancelled' : 'Completed'}</span></h1><p>{cancelled ? 'Sample cancellation is resolved and the parcel safely released.' : 'Simulated registration is complete. Review history and download the demo report.'}</p></div><strong>TRX-2025-1043<br /><small>{cancelled ? 'Released • Demo' : 'Completed • Demo'}</small></strong></header>
    <button className="outcome-toggle" onClick={() => { setCancelled(!cancelled); setMessage(''); }}>Preview {cancelled ? 'completed' : 'cancelled'} outcome</button>
    <ol className="outcome-timeline">{milestones.map((item, i) => <li key={item}><b>✓</b><span>{cancelled && i === 4 ? 'Safely released' : item}</span><small>{[12, 14, 16, 24, 28][i]} Oct 2025 • sample</small></li>)}</ol>
    <div className="outcome-columns"><div>
      <section className="outcome-panel"><h2>{cancelled ? 'Cancellation resolved — simulated' : 'Registration Completed Successfully! (Demo)'}</h2><p>{cancelled ? 'This sample has authorised release and no unresolved hold. Relisting still requires eligible seller ownership and explicit consent.' : 'The sample registrar outcome is recorded. This prototype does not update legal ownership or government records.'}</p><div className="outcome-facts"><div>Completion Date<strong>28 Oct 2025</strong></div><div>Sample Registration No.<strong>HYD-DEMO-784312</strong></div><div>Status<strong>{cancelled ? 'Cancelled & Released' : 'Simulated & Closed'}</strong></div></div><div className="outcome-actions"><button onClick={() => download('Final report')}>↓ Download Final Report</button><button onClick={() => setMessage('Registered deed preview is unavailable: no official documents or government records are connected.')}>View Registered Deed</button><button onClick={() => setMessage('No government portal integration is configured. This is a simulated outcome only.')}>Government Portal Info</button></div></section>
      <section className="outcome-panel"><h2>Final Documents</h2><div className="outcome-documents">{documents.map(name => <button key={name} onClick={() => setMessage(`${name}: demo metadata only. No official file is available.`)}><span>▤</span>{name}<small>Demo metadata • View</small></button>)}</div></section>
    </div><aside>
      <section className="outcome-panel"><h2>Property Details</h2><div className="outcome-land">⌖ Agricultural Land</div><p>Narsingi, Hyderabad, Telangana</p><p>Survey No. 123/2 • 2.5 Acres</p><strong>₹45,00,000 (per acre)</strong></section>
      <section className="outcome-panel"><h2>Transaction Parties</h2><p>Ravi Kumar <small>Buyer • Sample new owner</small></p><p>Suresh Reddy <small>Seller • Previous owner</small></p></section>
      <section className="outcome-panel"><h2>Next Steps</h2><p>{cancelled ? 'Released parcel may become available with eligible seller consent.' : 'Previous seller cannot relist a completed transfer. A verified new owner needs a new reviewed listing.'}</p>{cancelled && <button onClick={() => setMessage('Demo seller consent recorded locally. Eligibility must be confirmed by the backend before publication; no listing was published.')}>I am the eligible seller — consent to relisting</button>}<button onClick={() => setMessage('Complete sample timeline: request accepted 12 Oct → documents reviewed 14 Oct → agreement 16 Oct → registration review 24 Oct → demo outcome 28 Oct.')}>View Complete Timeline →</button></section>
    </aside></div><p role="status" className="outcome-message">{message}</p>
  </SellerLayout>;
}