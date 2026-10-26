import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { bulkOptions, fmtDay, fmtQty, hasBulk, localDate, rupees, unitLabel, unitPrice } from '../format';
import { ErrorNote, PageHeader, ProductImage, Spinner } from '../components/ui';
import { useAuth, useCart, useShop } from '../state';

export const EVENT_TYPES = ['Wedding', 'Anniversary', 'Birthday', 'Puja', 'Party', 'Other'];
// The server asks for the same notice before an event.
const DAYS_AHEAD = 2;

export const EVENT_STATUS = {
  new: ['Waiting for our call', 'chip-yellow'],
  confirmed: ['Confirmed', 'chip-blue'],
  delivered: ['Delivered', 'chip-green'],
  cancelled: ['Cancelled', 'chip-grey'],
};

export default function Bulk() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'event' ? 'event' : 'daily';
  const { count } = useCart();

  return (
    <div className="page-narrow">
      <PageHeader title="Bulk orders" back="/" />
      <div className="page-body">
        <p className="muted">Special rates for big quantities: for shops, hotels, hostels, caterers and family functions.</p>
        <div role="tablist" aria-label="Kind of bulk order" className="bulk-tabs">
          {[['daily', 'Daily bulk', 'Buy now at bulk rates'], ['event', 'Event order', 'Wedding, anniversary, puja…']].map(([id, title, sub]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`bulk-tab ${tab === id ? 'is-on' : ''}`}
              onClick={() => setParams(id === 'event' ? { tab: 'event' } : {}, { replace: true })}>
              <strong>{title}</strong>
              <span>{sub}</span>
            </button>
          ))}
        </div>
        {tab === 'daily' ? <DailyBulk /> : <EventOrder />}
      </div>
      {tab === 'daily' && count > 0 && (
        <div className="action-bar">
          <Link to="/cart" className="btn btn-primary btn-lg btn-block">View cart · {count} item{count > 1 ? 's' : ''} →</Link>
        </div>
      )}
    </div>
  );
}

function DailyBulk() {
  const { products, loading } = useShop();
  const items = products.filter(hasBulk);
  if (loading) return <Spinner />;
  if (!items.length) {
    return <p className="card muted">Bulk rates are coming soon. For big quantities today, call or WhatsApp us (numbers at the bottom of the page).</p>;
  }
  return (
    <section className="stack-sm">
      <p className="small muted">Order like any other order: pick a delivery slot and pay by UPI or cash.</p>
      {items.map((p) => <BulkRow key={p.id} p={p} />)}
    </section>
  );
}

function BulkRow({ p }) {
  const { lines, add } = useCart();
  const options = bulkOptions(p);
  const [qty, setQty] = useState(options[0]);
  const inCart = lines[p.id] || 0;
  const left = p.stock - inCart;
  const soldOut = p.stock < p.bulkMin;

  return (
    <article className="card bulk-row">
      <ProductImage product={p} className="thumb" />
      <div className="stack-xs grow">
        <span className="bulk-row-name"><strong>{p.name}</strong>{p.localName && <span className="muted small">{p.localName}</span>}</span>
        <span className="small"><s className="muted">{rupees(p.price)}</s> <strong className="text-green">{rupees(p.bulkPrice)} {unitLabel(p.unit)}</strong> from {fmtQty(p.bulkMin, p.unit)}</span>
        {soldOut ? <span className="small text-red strong">Not enough stock for bulk today</span> : (
          <span className="small">{fmtQty(qty, p.unit)} = <strong>{rupees(qty * p.bulkPrice)}</strong> <span className="text-green strong">· save {rupees(qty * (p.price - p.bulkPrice))}</span></span>
        )}
        {inCart > 0 && <span className="in-cart">In cart: {fmtQty(inCart, p.unit)}</span>}
      </div>
      {!soldOut && (
        <div className="bulk-row-actions">
          <label className="qty-select">
            <span className="sr-only">Quantity of {p.name}</span>
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
              {options.map((o) => <option key={o} value={o} disabled={o > left + 1e-9}>{fmtQty(o, p.unit)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={qty > left + 1e-9} onClick={() => add(p.id, qty)}>Add</button>
        </div>
      )}
    </article>
  );
}

const newItem = () => ({ productId: '', qty: '' });

function EventOrder() {
  const { user } = useAuth();
  const { products } = useShop();
  const [requests, setRequests] = useState(null);
  const [f, setF] = useState({ eventType: 'Wedding', eventDate: '', guests: '', address: '', notes: '' });
  const [items, setItems] = useState([newItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    api('/events/mine').then(setRequests).catch(() => setRequests([]));
    api('/addresses').then((list) => {
      const a = list[0];
      if (a) setF((v) => (v.address ? v : { ...v, address: [a.line, a.landmark, a.pincode].filter(Boolean).join(', ') }));
    }).catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="card stack-sm">
        <strong>Planning a wedding, anniversary or puja?</strong>
        <span className="muted small">Tell us the date and what you need. We'll call you to confirm bulk prices and delivery time.</span>
        <Link to="/login?next=%2Fbulk%3Ftab%3Devent" className="btn btn-primary">Log in to send a request</Link>
      </div>
    );
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setItem = (idx, k, v) => setItems(items.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const priced = items.map((it) => {
    const p = products.find((x) => x.id === Number(it.productId));
    const qty = Number(it.qty);
    return p && qty > 0 ? { ...it, p, qty, total: Math.round(qty * unitPrice(p, qty)) } : null;
  });
  const estimate = priced.reduce((s, it) => s + (it ? it.total : 0), 0);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...f, items: priced.filter(Boolean).map((it) => ({ productId: it.p.id, qty: it.qty })) };
      const r = await api('/events', { method: 'POST', body });
      setRequests((list) => [r, ...(list || [])]);
      setF((v) => ({ ...v, eventDate: '', guests: '', notes: '' }));
      setItems([newItem()]);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {sent && <p className="ok-note" role="status">Request sent! We'll call you on +91 {user.phone} to confirm the price and delivery time.</p>}
      <form className="card stack-sm" onSubmit={submit}>
        <strong>Tell us about your event</strong>
        <div className="form-grid">
          <label className="field"><span>Event</span>
            <select className="input" value={f.eventType} onChange={set('eventType')}>
              {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field"><span>Event date</span>
            <input className="input" type="date" required min={localDate(DAYS_AHEAD)} value={f.eventDate} onChange={set('eventDate')} />
            <span className="time-hint">At least {DAYS_AHEAD} days from today</span>
          </label>
          <label className="field"><span>Guests (approx.)</span>
            <input className="input" inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 200" />
          </label>
          <label className="field"><span>Delivery address</span>
            <input className="input" required maxLength={300} value={f.address} onChange={set('address')} placeholder="Venue or home address" />
          </label>
        </div>

        <span className="field-title">What do you need?</span>
        {items.map((it, idx) => {
          const line = priced[idx];
          return (
            <div key={idx} className="event-item">
              <select className="input" aria-label={`Item ${idx + 1}`} value={it.productId} onChange={(e) => setItem(idx, 'productId', e.target.value)}>
                <option value="">Choose a vegetable</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.localName ? ` (${p.localName})` : ''}</option>)}
              </select>
              <span className="money-input event-qty">
                <input inputMode="decimal" aria-label={`Quantity of item ${idx + 1}`} placeholder="Qty" value={it.qty}
                  onChange={(e) => setItem(idx, 'qty', e.target.value.replace(/[^\d.]/g, ''))} />
                <span>{line?.p.unit || 'kg'}</span>
              </span>
              <span className="event-line-total">{line ? rupees(line.total) : ''}</span>
              <button type="button" className="link-btn danger small" aria-label={`Remove item ${idx + 1}`}
                onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : [newItem()])}>✕</button>
            </div>
          );
        })}
        <button type="button" className="link-btn" onClick={() => setItems([...items, newItem()])}>+ Add another item</button>

        <label className="field"><span>Anything else? (other items, delivery time, cutting/peeling…)</span>
          <textarea className="input textarea" rows={3} maxLength={1000} value={f.notes} onChange={set('notes')} placeholder="e.g. Need delivery by 6 AM. Also 5 kg paneer." />
        </label>

        {estimate > 0 && (
          <div className="row-between event-estimate">
            <span>Estimate at today's bulk rates</span><strong>{rupees(estimate)}</strong>
          </div>
        )}
        <span className="muted small">This is only an estimate. We'll call you to confirm the final price, since mandi rates change daily.</span>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </form>

      {requests?.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-label">Your event requests</h2>
          {requests.map((r) => (
            <div key={r.id} className="card stack-xs">
              <div className="row-between">
                <strong>{r.eventType} · {fmtDay(r.eventDate)}</strong>
                <span className={`chip-status ${EVENT_STATUS[r.status][1]}`}>{EVENT_STATUS[r.status][0]}</span>
              </div>
              <span className="muted small">{r.items.map((i) => `${i.name} ${i.qtyLabel}`).join(', ') || r.notes}</span>
              {r.estimate > 0 && <span className="small">Estimate {rupees(r.estimate)}</span>}
              {r.shopNote && <span className="small text-green strong">Shop: {r.shopNote}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
