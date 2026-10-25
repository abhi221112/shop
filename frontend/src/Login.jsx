import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, storage } from './api';
import { BackIcon } from './components/Icons';
import { ErrorNote } from './components/ui';
import { useAuth, useShop } from './state';

const homeFor = (role) => (role === 'admin' ? '/admin' : role === 'delivery' ? '/delivery' : '/');

export default function Login() {
  const { login } = useAuth();
  const { config } = useShop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/auth/otp', { method: 'POST', body: { phone } });
      setDevCode(res.devCode || '');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ref = storage.get('ref') || params.get('ref') || '';
      const res = await api('/auth/verify', { method: 'POST', body: { phone, code, name, ref } });
      storage.set('ref', null);
      login(res.token, res.user);
      const next = params.get('next');
      navigate(next && next.startsWith('/') ? next : homeFor(res.user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <Link to="/" className="icon-btn login-back" aria-label="Back to shop"><BackIcon /></Link>
        <span className="brand"><img src="/logo.webp" alt={config.shopName} className="brand-logo" /></span>
        {step === 'phone' ? (
          <form onSubmit={sendCode} className="stack">
            <h1>Log in with your mobile number</h1>
            <p className="muted">We'll send you a 4-digit code.</p>
            <label className="field">
              <span>Mobile number</span>
              <div className="phone-input">
                <span>+91</span>
                <input type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14} required autoFocus
                  value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
              </div>
            </label>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Get code'}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <h1>Enter the code</h1>
            <p className="muted">
              Sent to +91 {phone}.{' '}
              <button type="button" className="link-btn" onClick={() => { setStep('phone'); setCode(''); setError(''); }}>Change</button>
            </p>
            {devCode && <p className="dev-note">Test mode: your code is <strong>{devCode}</strong></p>}
            <label className="field">
              <span>4-digit code</span>
              <input className="input otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={4} required autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </label>
            {(storage.get('ref') || params.get('ref')) && (
              <p className="ok-note">Friend's code <strong>{storage.get('ref') || params.get('ref')}</strong> will be applied, so you get welcome credit as a new customer.</p>
            )}
            <label className="field">
              <span>Your name <span className="muted">(new customers)</span></span>
              <input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
            </label>
            <ErrorNote>{error}</ErrorNote>
            <button className="btn btn-primary btn-lg" disabled={busy || code.length !== 4}>{busy ? 'Checking…' : 'Log in'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
