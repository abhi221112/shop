import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDay, rupees, STATUS_CHIP, STATUS_LABEL } from '../format';
import { ErrorNote, Spinner } from '../components/ui';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/orders/mine').then(setOrders).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="container page page-narrow-desktop">
      <h1 className="page-title">My orders</h1>
      <ErrorNote>{error}</ErrorNote>
      {orders === null && !error && <Spinner />}
      {orders?.length === 0 && (
        <div className="empty-state">
          <p>No orders yet.</p>
          <Link to="/" className="btn btn-primary">Start shopping</Link>
        </div>
      )}
      <div className="stack-sm">
        {orders?.map((o) => (
          <Link key={o.id} to={`/orders/${o.id}`} className="card order-row">
            <span className="stack-xs grow">
              <strong>#{o.code}</strong>
              <span className="muted small">{fmtDay(o.slot.date)} · {o.slot.label} · {o.items.length} items</span>
            </span>
            <span className="stack-xs align-end">
              <strong>{rupees(o.total)}</strong>
              <span className={`chip-status ${STATUS_CHIP[o.status]}`}>{STATUS_LABEL[o.status]}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
