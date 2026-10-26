import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { fmtDay, fmtTime, rupees } from '../format';
import { ErrorNote, Spinner } from '../components/ui';
import { EVENT_STATUS } from '../shop/Bulk';

const TABS = [['new', 'New requests'], ['confirmed', 'Confirmed'], ['delivered', 'Delivered'], ['cancelled', 'Cancelled'], ['', 'All']];

export default function AdminEvents() {
  const [tab, setTab] = useState('new');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/events${tab ? `?status=${tab}` : ''}`).then(setList).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => { setList(null); load(); }, [load]);

  return (
    <div className="stack page-narrow-desktop">
      <div className="stack-xs">
        <h1 className="page-title">Event orders</h1>
        <span className="muted">Weddings, anniversaries, pujas… Call the customer, agree the final price and time, then mark the request confirmed. Daily bulk orders arrive with the normal orders.</span>
      </div>
      <div role="tablist" aria-label="Status" className="row gap wrap">
        {TABS.map(([id, label]) => (
          <button key={id || 'all'} role="tab" aria-selected={tab === id} className={`chip chip-dark ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {list === null ? <Spinner /> : list.length === 0 ? (
        <p className="muted">{tab === 'new' ? 'No new event requests.' : 'Nothing here.'}</p>
      ) : list.map((r) => <EventCard key={r.id} r={r} onDone={load} />)}
    </div>
  );
}

function EventCard({ r, onDone }) {
  const [note, setNote] = useState(r.shopNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [label, chip] = EVENT_STATUS[r.status];

  async function setStatus(status) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/events/${r.id}`, { method: 'POST', body: { status, note } });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  const next = { new: ['confirmed', 'cancelled'], confirmed: ['delivered', 'cancelled'] }[r.status] || [];
  const actionText = { confirmed: 'Mark confirmed', delivered: 'Mark delivered', cancelled: 'Cancel request' };

  return (
    <article className="card stack-sm">
      <div className="row-between wrap">
        <span className="stack-xs">
          <strong>{r.eventType} · {fmtDay(r.eventDate)}{r.guests ? ` · ${r.guests} guests` : ''}</strong>
          <span className="muted small">
            {r.customerName} · <a href={`tel:+91${r.customerPhone}`}>{r.customerPhone}</a> · <a href={`https://wa.me/91${r.customerPhone}`} target="_blank" rel="noreferrer">WhatsApp</a>
            {' '}· sent {fmtDay(r.createdAt.slice(0, 10)).toLowerCase()} {fmtTime(r.createdAt)}
          </span>
        </span>
        <span className={`chip-status ${chip}`}>{label}</span>
      </div>
      <span className="small"><strong>Deliver to:</strong> {r.address}</span>

      {r.items.length > 0 && (
        <div className="stack-xs">
          {r.items.map((i) => (
            <div key={i.productId} className="row-between small">
              <span>{i.name} · {i.qtyLabel} @ {rupees(i.price)}{i.bulk && <span className="bulk-tag">Bulk rate</span>}</span>
              <span>{rupees(i.lineTotal)}</span>
            </div>
          ))}
          <div className="row-between small strong"><span>Estimate</span><span>{rupees(r.estimate)}</span></div>
        </div>
      )}
      {r.notes && <p className="complaint-text">“{r.notes}”</p>}

      {next.length > 0 ? (
        <div className="stack-sm">
          <label className="field"><span>Note to customer (price agreed, delivery time…)</span>
            <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Final price ₹4,800, delivery 6 AM on the day" />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="row gap wrap">
            {next.map((s) => (
              <button key={s} className={`btn ${s === 'cancelled' ? 'btn-outline' : 'btn-primary'}`} disabled={busy} onClick={() => setStatus(s)}>{actionText[s]}</button>
            ))}
          </div>
        </div>
      ) : r.shopNote && <span className="small muted">Note: {r.shopNote}</span>}
    </article>
  );
}
