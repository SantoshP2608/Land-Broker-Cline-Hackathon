import React from 'react';
import './HomeLeft.css';

const features = [
  { key: 'trusted', lines: ['Trusted', 'Information'], tone: 'teal' },
  { key: 'extraction', lines: ['AI Document', 'Extraction'], tone: 'blue' },
  { key: 'comparison', lines: ['Cross-Document', 'Comparison'], tone: 'teal' },
  { key: 'transparency', lines: ['Buyer & Seller', 'Transparency'], tone: 'blue' },
];

function FeatureIcon({ kind }) {
  const paths = {
    trusted: <><path d="m16 3 11 4v9c0 7-5 11-11 14C10 27 5 23 5 16V7Z" /><path d="m10 16 4 4 8-9" /></>,
    extraction: <><path d="M8 3h11l6 6v20H8Z" /><path d="M19 3v7h6M12 15h9M12 20h9M12 25h6" /></>,
    comparison: <><circle cx="14" cy="14" r="9" /><path d="m21 21 8 8" /></>,
    transparency: <><circle cx="10" cy="10" r="4" /><circle cx="24" cy="10" r="4" /><path d="M3 27v-5a7 7 0 0 1 14 0v5M21 18a7 7 0 0 1 10 6v3H21" /></>,
  };

  return <svg viewBox="0 0 34 34" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

/** Supply asset URLs through backgroundImage and featureIcons; actions are owned by the parent. */
export default function HomeLeft({ backgroundImage, featureIcons = {}, onTryDemo, onWatchHowItWorks }) {
  return (
    <section
      className={`home-hero${backgroundImage ? ' home-hero--with-image' : ''}`}
      style={backgroundImage ? { '--home-hero-image': `url(${JSON.stringify(backgroundImage)})` } : undefined}
      aria-labelledby="home-hero-title"
    >
      <div className="home-hero__content">
        <div className="home-hero__notice" role="note">
          <span className="home-hero__demo"><span className="home-hero__dot" />Demo version</span>
          <span className="home-hero__notice-text">Uses sample documents and datasets. Real deployment will be government-controlled.</span>
        </div>

        <h1 id="home-hero-title" className="home-hero__title">
          <span>Verify Property</span>
          <span>Documents</span>
          <span className="home-hero__gradient">Before You Register</span>
        </h1>

        <p className="home-hero__description">
          An AI-assisted platform that checks property documents,
          compares details across sources, identifies discrepancies,
          and gives both buyer and seller a clear, evidence-based report.
        </p>

        <div className="home-hero__actions">
          <button type="button" className="home-hero__button home-hero__button--primary" onClick={onTryDemo} disabled={!onTryDemo}>
            Try Demo
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg>
          </button>
          <button type="button" className="home-hero__button home-hero__button--secondary" onClick={onWatchHowItWorks} disabled={!onWatchHowItWorks}>
            <span className="home-hero__play" aria-hidden="true"><svg viewBox="0 0 20 20" fill="currentColor"><path d="m7 4 9 6-9 6Z" /></svg></span>
            Watch How It Works
          </button>
        </div>

        <ul id="features" className="home-hero__features" aria-label="Platform features">
          {features.map(({ key, lines, tone }) => (
            <li key={key} className="home-hero__feature">
              <span className={`home-hero__feature-icon home-hero__feature-icon--${tone}${featureIcons[key] ? ' home-hero__feature-icon--asset' : ''}`}>
                {featureIcons[key] ? <img src={featureIcons[key]} alt="" width="64" height="64" /> : <FeatureIcon kind={key} />}
              </span>
              <span className="home-hero__feature-label">{lines[0]}<br />{lines[1]}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
