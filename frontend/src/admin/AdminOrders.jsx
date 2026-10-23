import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, localDate, rupees, STATUS_CHIP, STATUS_LABEL } from '../format';
import { ErrorNote, Spinner, usePolling } from '../components/ui';

const NEXT_ACTION = {
  new: ['confirmed', 'Confirm'],
  confirmed: ['packed', 'Mark packed'],
  packed: ['out', 'Send out'],
  not_available: ['out', 'Send again'],
};

const mapLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

function Proof({ order: o }) {
  if (o.status !== 'delivered' || !o.proof) return null;
  const at = o.history.findLast((h) => h.status === 'delivered')?.at;
  return (
    <div className="proof small">
      {o.proof.verified
        ? <span className="text-green strong">✓ Customer code verified</span>
        : <span className="text-red strong">! Marked without code</span>}
      <span className="muted">{fmtTime(at)}{o.proof.lat != null && <> · <a href={mapLink(o.proof)} target="_blank" rel="noreferrer">location</a></>}</span>
    </div>
  );
}

export default function AdminOrders() {
  const [date, setDate] = useState(localDate());
  const [slotId, setSlotId] = useState('');
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState(null);
  const [staff, setStaff] = useState([]);
  const [selected, setSelected] = useState([]);
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const qs = `?date=${date}${slotId ? `&slotId=${slotId}` : ''}`;
      const [s, o, st] = await Promise.all([api(`/admin/summary?date=${date}`), api(`/admin/orders${qs}`), api('/admin/staff')]);
      setSummary(s);
      setOrders(o);
      setStaff(st);
    } catch (e) {
      setError(e.message);
    }
  }, [date, slotId]);
  usePolling(load, 30000, [load]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (o, status) => run(() => api(`/admin/orders/${o.id}/status`, { method: 'POST', body: { status } }));
  const assign = (ids, deliveryUserId) => run(() => api('/admin/orders/assign', { method: 'POST', body: { orderIds: ids, deliveryUserId: deliveryUserId || null } }));
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const open = (orders || []).filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="stack">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Orders</h1>
          <span className="muted">{dateLabel}</span>
        </div>
        <div className="row gap wrap">
          <label className="sr-only" htmlFor="order-date">Date</label>
          <input id="order-date" type="date" className="input input-auto" value={date} onChange={(e) => { setDate(e.target.value); setSelected([]); }} />
          <Link to={`/admin/packing?date=${date}${slotId ? `&slotId=${slotId}` : ''}`} className="btn btn-outline">Print packing list</Link>
        </div>
      </div>

      {summary && (
        <div className="stat-grid">
          <Stat label="Orders" value={summary.orders} note={`${summary.toPack} still to pack`} />
          <Stat label="Sales" value={rupees(summary.sales)} note={`UPI ${rupees(summary.upi)} · Cash ${rupees(summary.cash)}`} />
          <Stat label="To pack now" value={summary.toPack} note="New and confirmed orders" />
          <Stat label="Low stock" value={`${summary.lowStock.length} items`} note={summary.lowStock.slice(0, 3).join(', ') || 'All stocked'} />
          {summary.issues > 0 && <Stat label="Customer problems" value={summary.issues} note="Reported on delivered orders · shown in red below" alert />}
        </div>
      )}

      <div role="tablist" aria-label="Delivery slot" className="row gap wrap">
        <button role="tab" aria-selected={!slotId} className={`chip chip-dark ${!slotId ? 'is-on' : ''}`} onClick={() => setSlotId('')}>All slots</button>
        {summary?.slots.map((s) => (
          <button key={s.id} role="tab" aria-selected={String(s.id) === slotId} className={`chip chip-dark ${String(s.id) === slotId ? 'is-on' : ''}`}
            onClick={() => setSlotId(String(s.id))}>{s.label} · {s.orders} orders</button>
        ))}
      </div>

      {selected.length > 0 && (
        <div className="card row gap wrap bulk-bar">
          <strong>{selected.length} selected</strong>
          <select className="input input-auto" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Delivery person">
            <option value="">Choose delivery person</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!assignTo || busy} onClick={() => assign(selected, assignTo).then(() => setSelected([]))}>Assign to delivery</button>
          <button className="link-btn" onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {orders === null ? <Spinner /> : (
        <div className="table-box">
          <table className="table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Select all open orders" checked={open.length > 0 && selected.length === open.length}
                  onChange={(e) => setSelected(e.target.checked ? open.map((o) => o.id) : [])} /></th>
                <th>Order</th><th>Customer</th><th>Items</th><th>Amount</th><th>Payment</th><th>Delivery by</th><th>Status</th>
                <th><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan={9} className="muted center">No orders for this day yet.</td></tr>}
              {orders.map((o) => {
                const next = NEXT_ACTION[o.status];
                const closed = ['delivered', 'cancelled', 'out'].includes(o.status);
                return (
                  <tr key={o.id} className={o.status === 'cancelled' ? 'is-dim' : o.issue ? 'has-issue' : ''}>
                    <td>{!['delivered', 'cancelled'].includes(o.status) && (
                      <input type="checkbox" aria-label={`Select ${o.code}`} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                    )}</td>
                    <td>
                      <strong>#{o.code}</strong>
                      {o.slot.express
                        ? <div className="small"><span className="express-tag">Express · due {fmtTime(o.dueAt)}</span></div>
                        : <div className="muted small">{o.slot.label}</div>}
                    </td>
                    <td>{o.customerName}<div className="muted small"><a href={`tel:${o.customerPhone}`}>{o.customerPhone}</a></div></td>
                    <td className="items-cell">
                      {[...new Set(o.items.map((i) => i.comboName ? `${i.comboName}${i.comboCount > 1 ? ` ×${i.comboCount}` : ''}` : `${i.name} ${i.qtyLabel}`))].join(', ')}
                      {o.gift && <div className="small text-green strong">+ Free {o.gift}</div>}
                    </td>
                    <td><strong>{rupees(o.total)}</strong>{o.discount > 0 && <div className="muted small">−{rupees(o.discount)} off</div>}</td>
                    <td>{o.paymentMethod === 'upi' ? `UPI · ${o.paymentStatus}` : `Cash${o.paymentStatus === 'paid' ? ' · collected' : ''}`}</td>
                    <td>
                      {closed ? (o.delivery?.name || '—') : (
                        <select className="input input-sm" value={o.delivery?.id || ''} aria-label={`Delivery person for ${o.code}`}
                          disabled={busy} onChange={(e) => assign([o.id], e.target.value)}>
                          <option value="">Not assigned</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      <span className={`chip-status ${STATUS_CHIP[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                      <Proof order={o} />
                      {o.issue && <div className="issue small" title={o.issue.text}>Customer reported: “{o.issue.text}”</div>}
                    </td>
                    <td className="actions-cell">
                      {next && <button className="btn btn-sm btn-outline-green" disabled={busy} onClick={() => setStatus(o, next[0])}>{next[1]}</button>}
                      {o.status === 'out' && (
                        <button className="btn btn-sm btn-outline" disabled={busy}
                          onClick={() => window.confirm(`Mark ${o.code} delivered without the customer's code?

Only do this after you have confirmed with the customer by phone. It will be recorded as "marked without code".`) && setStatus(o, 'delivered')}>
                          Mark delivered (no code)
                        </button>
                      )}
                      {['new', 'confirmed', 'packed', 'not_available'].includes(o.status) && (
                        <button className="link-btn danger small" disabled={busy}
                          onClick={() => window.confirm(`Cancel order ${o.code}? Stock will be put back.`) && setStatus(o, 'cancelled')}>Cancel</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value, note, alert }) => (
  <div className={`card stat ${alert ? 'stat-alert' : ''}`}>
    <span className="muted small">{label}</span>
    <strong className="stat-value">{value}</strong>
    <span className="muted small">{note}</span>
  </div>
);
