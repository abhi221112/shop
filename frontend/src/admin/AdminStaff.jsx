import { useEffect, useState } from 'react';
import { api } from '../api';
import { ErrorNote } from '../components/ui';

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ name: '', phone: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/staff').then(setStaff).catch((e) => setError(e.message));
  }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      const s = await api('/admin/staff', { method: 'POST', body: f });
      setStaff([...staff.filter((x) => x.id !== s.id), s]);
      setF({ name: '', phone: '' });
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(s) {
    if (!window.confirm(`Remove ${s.name} from delivery staff? They can still shop as a customer.`)) return;
    try {
      await api(`/admin/staff/${s.id}`, { method: 'DELETE' });
      setStaff(staff.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack page-narrow-desktop">
      <div className="stack-xs">
        <h1 className="page-title">Delivery staff</h1>
        <span className="muted">They log in with their mobile number and see only the orders you assign them.</span>
      </div>
      <form className="card row gap wrap align-end" onSubmit={add}>
        <label className="field grow"><span>Name</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field grow"><span>Mobile number</span><input className="input" required type="tel" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <button className="btn btn-primary">Add</button>
      </form>
      <ErrorNote>{error}</ErrorNote>
      <div className="stack-sm">
        {staff.length === 0 && <p className="muted">No delivery staff yet.</p>}
        {staff.map((s) => (
          <div key={s.id} className="card person-card">
            <span className="avatar">{s.name.charAt(0)}</span>
            <span className="stack-xs grow">
              <strong>{s.name}</strong>
              <span className="muted small">+91 {s.phone} · {s.activeOrders} active orders today</span>
            </span>
            <button className="link-btn danger" onClick={() => remove(s)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
