import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { rupees } from '../format';
import { MapIcon, PhoneIcon } from '../components/Icons';
import { ErrorNote, PageHeader, Spinner } from '../components/ui';
import { mapsUrl, toCollect } from './DeliveryList';
import OrderItems from '../components/OrderItems';

export default function DeliveryOrder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    api(`/delivery/orders/${id}`).then(setOrder).catch((e) => setError(e.message));
  }, [id]);

  async function act(path, confirmText, body) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api(`/delivery/orders/${id}/${path}`, { method: 'POST', body });
      setOrder(updated);
      if (['delivered', 'not_available'].includes(updated.status)) navigate('/delivery');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) return <div className="delivery"><PageHeader title="Order" back="/delivery" />{error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}</div>;

  const collect = toCollect(order);

  return (
    <div className="delivery page-narrow delivery-detail">
      <PageHeader title={`#${order.code}`} back="/delivery" />
      <div className="page-body">
        <section className="card stack-sm">
          <div className="row-between">
            <span className="stack-xs">
              <strong className="big">{order.customerName}</strong>
              <span className="muted small">{order.address} · {order.pincode}</span>
            </span>
            <a href={`tel:${order.customerPhone}`} className="icon-btn icon-btn-outline" aria-label={`Call ${order.customerName}`}><PhoneIcon size={20} /></a>
          </div>
          <a href={mapsUrl(order)} target="_blank" rel="noreferrer" className="btn btn-outline"><MapIcon size={18} />Open in Google Maps</a>
        </section>

        <section className="card stack-sm">
          <h2 className="card-title">In the bag ({order.items.length} items)</h2>
          <OrderItems order={order} prices={false} />
        </section>

        <section className={`card row-between ${collect ? 'cash-card' : ''}`}>
          <span className="stack-xs">
            <span>{collect ? 'Cash on delivery' : 'Already paid by UPI'}</span>
            {collect && <span className="small">Customer can also pay by UPI QR</span>}
          </span>
          <strong className="huge">{rupees(order.total)}</strong>
        </section>
      </div>

      <div className="action-bar action-bar-stack">
        <ErrorNote>{error}</ErrorNote>
        {order.status === 'packed' || order.status === 'not_available' ? (
          <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => act('pickup')}>Picked up · Start delivery</button>
        ) : order.status === 'out' ? (
          <form className="stack-sm" onSubmit={async (e) => {
            e.preventDefault();
            if (collect && !window.confirm(`Collected ${rupees(order.total)}?`)) return;
            setBusy(true);
            const where = await currentPosition();
            await act('delivered', null, { code, ...where });
          }}>
            <label className="field">
              <span>Delivery code from the customer</span>
              <input className="input otp-input" inputMode="numeric" autoComplete="off" maxLength={4} required
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••" />
            </label>
            <span className="muted small">Hand over the bag first, then ask the customer for the 4-digit code on their order page or message.</span>
            <button className="btn btn-primary btn-lg btn-block" disabled={busy || code.length !== 4}>
              {busy ? 'Checking…' : collect ? 'Cash collected · Mark delivered' : 'Mark delivered'}
            </button>
          </form>
        ) : null}
        {order.status === 'out' && (
          <button className="btn btn-outline btn-block" disabled={busy}
            onClick={() => act('not-available', 'Mark the customer as not available?')}>Customer not available</button>
        )}
        {!['packed', 'not_available', 'out'].includes(order.status) && (
          <p className="muted center">
            {['new', 'confirmed'].includes(order.status)
              ? 'The shop is still packing this order. You can pick it up once it is marked packed.'
              : `This order is ${order.status.replace('_', ' ')}.`}
          </p>
        )}
      </div>
    </div>
  );
}

/** Best-effort GPS stamp for proof of delivery; resolves to {} if denied or slow. */
function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
    );
  });
}
