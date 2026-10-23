import { useState } from 'react';
import { api } from '../api';
import { ErrorNote } from '../components/ui';

export default function AddressForm({ onSaved, onCancel }) {
  const [f, setF] = useState({ label: 'Home', line: '', landmark: '', pincode: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(await api('/addresses', { method: 'POST', body: f }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <h2 className="card-title">New address</h2>
      <div className="seg">
        {['Home', 'Work', 'Other'].map((l) => (
          <button type="button" key={l} className={`chip ${f.label === l ? 'is-on' : ''}`} onClick={() => setF({ ...f, label: l })}>{l}</button>
        ))}
      </div>
      <label className="field"><span>House / flat no., street, area</span>
        <input className="input" required value={f.line} onChange={set('line')} placeholder="Flat 302, Green Park Road" autoComplete="street-address" />
      </label>
      <label className="field"><span>Landmark and delivery notes <span className="muted">(optional)</span></span>
        <input className="input" value={f.landmark} onChange={set('landmark')} placeholder="Near Ram Mandir · ring bell twice" />
      </label>
      <label className="field"><span>Pincode</span>
        <input className="input" required inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, '') })} autoComplete="postal-code" />
      </label>
      <ErrorNote>{error}</ErrorNote>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save address'}</button>
        {onCancel && <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
