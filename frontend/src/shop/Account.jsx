import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { LogoutIcon, PinIcon } from '../components/Icons';
import { ErrorNote } from '../components/ui';
import { useAuth } from '../state';
import AddressForm from './AddressForm';

export default function Account() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/addresses').then(setAddresses).catch((e) => setError(e.message));
  }, []);

  async function saveName(e) {
    e.preventDefault();
    setError('');
    try {
      setUser(await api('/auth/me', { method: 'PATCH', body: { name } }));
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeAddress(id) {
    await api(`/addresses/${id}`, { method: 'DELETE' }).catch((e) => setError(e.message));
    setAddresses(addresses.filter((a) => a.id !== id));
  }

  return (
    <div className="container page page-narrow-desktop stack">
      <h1 className="page-title">Account</h1>

      {user.role !== 'customer' && (
        <Link to={user.role === 'admin' ? '/admin' : '/delivery'} className="card staff-link">
          <strong>{user.role === 'admin' ? 'Open shop admin' : 'Open my deliveries'}</strong>
          <span>→</span>
        </Link>
      )}

      <Link to="/refer" className="card staff-link refer-link">
        <span className="stack-xs"><strong>Refer & earn · Wallet</strong><span className="small">Your code, wallet balance and history</span></span>
        <span>→</span>
      </Link>

      <form className="card stack-sm" onSubmit={saveName}>
        <span className="muted small">Mobile: +91 {user.phone}</span>
        <label className="field"><span>Your name</span>
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} autoComplete="name" />
        </label>
        <button className="btn btn-primary" disabled={!name.trim() || name === user.name}>{saved ? 'Saved' : 'Save name'}</button>
      </form>

      <section className="stack-sm">
        <h2 className="section-label">Saved addresses</h2>
        {addresses.map((a) => (
          <div key={a.id} className="card address-option">
            <PinIcon />
            <span className="stack-xs grow">
              <strong>{a.label}</strong>
              <span className="muted small">{[a.line, a.landmark, a.pincode].filter(Boolean).join(', ')}</span>
            </span>
            <button className="link-btn danger" onClick={() => removeAddress(a.id)}>Remove</button>
          </div>
        ))}
        {adding
          ? <AddressForm onSaved={(a) => { setAddresses([...addresses, a]); setAdding(false); }} onCancel={() => setAdding(false)} />
          : <button className="link-btn" onClick={() => setAdding(true)}>+ Add a new address</button>}
      </section>

      <ErrorNote>{error}</ErrorNote>
      <button className="btn btn-outline" onClick={() => { logout(); navigate('/'); }}><LogoutIcon size={18} />Log out</button>
    </div>
  );
}
