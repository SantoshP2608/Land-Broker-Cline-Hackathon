import React, { useEffect, useRef, useState } from 'react';
import './Navbar.css';

export default function Navbar({ onOpenPanel }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    function onPointerDown(event) {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    }
    const desktop = window.matchMedia('(min-width: 901px)');
    function onResize() {
      if (desktop.matches) setMenuOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    desktop.addEventListener('change', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      desktop.removeEventListener('change', onResize);
    };
  }, [menuOpen]);

  function openPanel(panel) {
    setMenuOpen(false);
    onOpenPanel(panel);
  }

  return (
    <header className="site-header" ref={headerRef}>
      <nav className="site-nav" aria-label="Main navigation">
        <button
          ref={toggleRef}
          type="button"
          className="site-nav__toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav-menu"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span>Menu</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
        <div id="site-nav-menu" className={`site-nav__menu${menuOpen ? ' site-nav__menu--open' : ''}`}>
          <ul className="site-nav__links">
            <li><a className="site-nav__link site-nav__link--active" href="#home" aria-current="page" onClick={() => setMenuOpen(false)}>Home</a></li>
            <li><button type="button" className="site-nav__link" onClick={() => openPanel('workflow')}>How It Works</button></li>
            <li><a className="site-nav__link" href="#features" onClick={() => setMenuOpen(false)}>Features</a></li>
            <li><button type="button" className="site-nav__link" onClick={() => openPanel('about')}>About</button></li>
            <li><button type="button" className="site-nav__link" onClick={() => openPanel('demo')}>Demo</button></li>
          </ul>
          <div className="site-nav__actions">
            <button type="button" className="site-nav__button site-nav__button--secondary" onClick={() => openPanel('signin')}>Sign In</button>
            <button type="button" className="site-nav__button site-nav__button--primary" onClick={() => openPanel('demo')}>
              Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-7-7 7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
