import React, { useState } from 'react';
import { AccountFooter, Brand, DemoBadge, Icon } from './AccountShared.jsx';
import './account.css';
import './AuthPage.css';

export default function AuthPage({ onContinue, journey, onJourneyChange, onOpenPanel }) {
  const [tab, setTab] = useState('login');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  function changeTab(next) { setTab(next); setPassword(''); setConsent(false); }
  function submit(event) {
    event.preventDefault();
    // Demo-only navigation: no credential requests, persistence, or authenticated session.
    setPassword('');
    onContinue({ name: name.trim() || 'Demo citizen', email: email.trim() });
  }
  return (
    <div className="account-shell auth-page">
      <header className="auth-header">
        <Brand />
        <nav aria-label="Account navigation"><a href="#home">Home</a><button onClick={() => onOpenPanel('workflow')}>How It Works</button><button onClick={() => onOpenPanel('help')}>Help</button></nav>
        <DemoBadge /><a className="account-button auth-back" href="#home">← <span>Back to home</span></a>
      </header>
      <main className="auth-layout">
        <section className="auth-intro" aria-labelledby="journey-title">
          <h1 id="journey-title">Your property<br />journey <span className="account-gradient">starts here.</span></h1>
          <p>One account to buy land, sell land, and track every step.</p>
          <div className="auth-assurances"><span><Icon name="shield" />Transparent records</span><i>·</i><span><Icon name="file" />Evidence-based reviews</span></div>
        </section>
        <div className="auth-form-wrap">
          <section className="account-card auth-card" aria-labelledby="auth-title">
            <h2 id="auth-title">{tab === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p>{tab === 'login' ? 'Sign in to continue your land journey.' : 'One account for buying and selling.'}</p>
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              {['login', 'register'].map(value => <button key={value} role="tab" id={`tab-${value}`} aria-selected={tab === value} aria-controls="auth-panel" onClick={() => changeTab(value)}>{value === 'login' ? 'Login' : 'Register'}</button>)}
            </div>
            <form id="auth-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} onSubmit={submit}>
              <fieldset className="auth-journey"><legend>Continue your journey</legend>
                {['buying', 'selling'].map(value => <label key={value} className={journey === value ? 'is-selected' : ''}><Icon name={value === 'buying' ? 'home' : 'tag'} />{value === 'buying' ? 'Buying' : 'Selling'}<input type="radio" name="journey" value={value} checked={journey === value} onChange={() => onJourneyChange(value)} /></label>)}
              </fieldset><small className="auth-hint">You can switch anytime.</small>
              {tab === 'register' && <label className="account-field">Full name<input autoComplete="off" value={name} onChange={event => setName(event.target.value)} placeholder="Your demo name" required maxLength={100} /></label>}
              <label className="account-field">Email address<span className="auth-input"><Icon name="mail" /><input type="email" autoComplete="off" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></span></label>
              <label className="account-field">Password<span className="auth-input"><Icon name="lock" /><input type={showPassword ? 'text' : 'password'} autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} placeholder="Demo password only" minLength={8} required maxLength={128} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}><Icon name="eye" /></button></span></label>
              <div className="auth-options"><span>Demo session only</span>{tab === 'login' && <button className="account-link" type="button" onClick={() => onOpenPanel('reset')}>Forgot password?</button>}</div>
              {tab === 'register' && <label className="auth-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required />I agree to use sample details for this demo.</label>}
              <p className="auth-demo-note">Frontend demo only. Use sample details and a made-up password. Nothing is sent or stored; this does not authenticate an account.</p>
              <button className="account-button account-button--primary auth-submit" type="submit">{tab === 'login' ? 'Sign in' : 'Create account'}<Icon name="arrow" /></button>
            </form>
            <div className="auth-switch">{tab === 'login' ? 'New to LandShield?' : 'Already have an account?'} <button className="account-link" onClick={() => changeTab(tab === 'login' ? 'register' : 'login')}>{tab === 'login' ? 'Create an account' : 'Sign in'}</button></div>
          </section>
          <p className="auth-legal">By continuing, you agree to our <button className="account-link" onClick={() => onOpenPanel('terms')}>Terms</button> and <button className="account-link" onClick={() => onOpenPanel('privacy')}>Privacy Policy</button>.</p>
        </div>
      </main>
      <AccountFooter onOpenPanel={onOpenPanel} />
    </div>
  );
}
