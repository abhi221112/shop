import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, localDate, rupees } from '../format';
import { LogoutIcon } from '../components/Icons';
import { ErrorNote, Spinner, usePolling } from '../components/ui';
import { useAuth } from '../state';

export const mapsUrl = (o) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address} ${o.pincode}`)}`;
export const toCollect = (o) => o.paymentMethod === 'cod' && o.paymentStatus !== 'paid';
const atShop = (o) => ['new', 'confirmed'].includes(o.status);

const DAYS = [[0, 'Today'], [1, 'Tomorrow']];

export default function DeliveryList() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () => api(`/delivery/orders?date=${localDate(offset)}`).then(setOrders).catch((e) => setError(e.message)),
    [offset],
  );
  usePolling(load, 30000, [load]);

  const pick = (d) => { setOffset(d); setOrders(null); };
  const open = (orders || []).filter((o) => o.status !== 'delivered');
  const done = (orders || []).filter((o) => o.status === 'delivered');
  const cash = open.filter(toCollect).reduce((s, o) => s + o.total, 0);
  const slots = [...new Set((orders || []).map((o) => o.slot.label))];

  return (
    <div className="delivery">
      <header className="delivery-header">
        <div className="row-between">
          <div className="stack-xs">
            <span className="small">Delivery · {user.name || user.phone}</span>
            <h1>{DAYS[offset][1]}{slots.length === 1 ? `, ${slots[0]}` : ''}</h1>
          </div>
          <button className="icon-btn icon-btn-dark" aria-label="Log out" onClick={() => { logout(); navigate('/login'); }}><LogoutIcon size={20} /></button>
        </div>
        <div role="tablist" aria-label="Day" className="day-tabs">
          {DAYS.map(([d, label]) => (
            <button key={d} role="tab" aria-selected={offset === d} className={offset === d ? 'is-on' : ''} onClick={() => pick(d)}>{label}</button>
          ))}
        </div>
        <div className="delivery-stats">
          <div><strong>{open.length}</strong><span>To deliver</span></div>
          <div><strong>{done.length}</strong><span>Delivered</span></div>
          <div><strong>{rupees(cash)}</strong><span>Cash to collect</span></div>
        </div>
      </header>

      <div className="delivery-body">
        <ErrorNote>{error}</ErrorNote>
        {orders === null && !error && <Spinner />}
        {orders?.length === 0 && (
          <p className="empty">No orders assigned to you for {DAYS[offset][1].toLowerCase()} yet. This list refreshes by itself.</p>
        )}
        {[...open, ...done].map((o, i) => {
          const delivered = o.status === 'delivered';
          return (
            <article key={o.id} className={`card stop ${delivered ? 'is-done' : ''} ${o.slot.express && !delivered ? 'is-express' : ''}`}>
              <div className="row-between align-start">
                <div className="row gap-sm align-start">
                  <span className="stop-num">{i + 1}</span>
                  <span className="stack-xs">
                    <strong>{o.customerName} · #{o.code}</strong>
                    <span className="muted small">{o.address}</span>
                    <span className="small strong">
                      {o.slot.express ? <span className="express-tag">Express · due {fmtTime(o.dueAt)}</span> : o.slot.label}
                    </span>
                  </span>
                </div>
                {toCollect(o) ? <span className="tag tag-yellow">Collect {rupees(o.total)}</span> : <span className="tag tag-green">Paid</span>}
              </div>
              {delivered ? (
                <span className="text-green strong small">Delivered at {fmtTime(o.history.findLast((h) => h.status === 'delivered')?.at)}</span>
              ) : atShop(o) ? (
                <span className="muted small strong">Being packed at the shop. You can pick it up once it's marked packed.</span>
              ) : (
                <div className="stop-actions">
                  <a href={`tel:${o.customerPhone}`} className="btn btn-outline">Call</a>
                  <a href={mapsUrl(o)} target="_blank" rel="noreferrer" className="btn btn-outline">Map</a>
                  <Link to={`/delivery/${o.id}`} className="btn btn-primary">Open</Link>
                </div>
              )}
              {o.status === 'not_available' && <span className="text-red small strong">Marked not available. The shop will reschedule.</span>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
