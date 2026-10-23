import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { fmtDay, fmtTime, rupees, STATUS_LABEL } from '../format';
import { CheckIcon, PhoneIcon } from '../components/Icons';
import { ErrorNote, PageHeader, Spinner, usePolling } from '../components/ui';
import { payForOrder } from '../payments';
import { useAuth } from '../state';
import OrderItems from '../components/OrderItems';
import ReportProblem from './ReportProblem';

const STEPS = [
  ['new', 'Order placed'],
  ['confirmed', 'Confirmed by shop'],
  ['packed', 'Packed and weighed'],
  ['out', 'Out for delivery'],
  ['delivered', 'Delivered'],
];

export default function Tracking() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/orders/${id}`).then(setOrder).catch((e) => setError(e.message)), [id]);
  usePolling(load, 20000, [id]);

  if (!order) return <div className="page-narrow"><PageHeader title="Order" back="/orders" />{error ? <ErrorNote>{error}</ErrorNote> : <Spinner />}</div>;

  const reached = Object.fromEntries(order.history.map((h) => [h.status, h.at]));
  const current = STEPS.findIndex(([s]) => s === order.status);
  const unpaid = order.paymentMethod === 'upi' && order.paymentStatus !== 'paid' && order.status === 'new';
  const ended = ['cancelled', 'not_available'].includes(order.status);

  async function act(fn) {
    setBusy(true);
    setError('');
    try {
      const updated = await fn();
      if (updated) setOrder(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow">
      <PageHeader title={`Order #${order.code}`} back="/orders" />
      <div className="page-body">
        <section className={`status-hero ${ended ? 'is-ended' : ''}`}>
          <span className="small">
            {order.status === 'delivered' ? 'Delivered' : ended ? STATUS_LABEL[order.status]
              : order.dueAt ? 'Express delivery · arriving by' : `Arriving ${fmtDay(order.slot.date).toLowerCase()}`}
          </span>
          <strong className="status-hero-big">{order.dueAt ? fmtTime(order.dueAt) : order.slot.label}</strong>
          <span className="small">
            {order.status === 'cancelled' ? 'This order was cancelled.' :
              order.status === 'not_available' ? 'We missed you. The shop will call to reschedule.' :
              'This page updates by itself.'}
          </span>
        </section>

        {order.status === 'out' && order.deliveryCode && (
          <section className="card code-card">
            <span className="small">Your delivery code</span>
            <strong className="code-digits" aria-label={`Delivery code ${order.deliveryCode.split('').join(' ')}`}>{order.deliveryCode}</strong>
            <span className="small">Tell this code to the delivery person <strong>only after</strong> you have the bag in your hands. It's how the shop knows you received your order.</span>
          </section>
        )}

        {order.status === 'delivered' && <ReportProblem order={order} onUpdate={setOrder} />}

        {unpaid && (
          <section className="card warn-card">
            <strong>Waiting for your UPI payment</strong>
            <span className="small">Unpaid orders are cancelled after 30 minutes.</span>
            <button className="btn btn-primary" disabled={busy} onClick={() => act(() => payForOrder(order, user))}>Pay {rupees(order.total)} now</button>
          </section>
        )}

        {!ended && (
          <section className="card timeline">
            {STEPS.map(([status, label], i) => {
              const done = i < current || order.status === 'delivered';
              const now = i === current && order.status !== 'delivered';
              return (
                <div key={status} className="timeline-step">
                  <div className="timeline-rail">
                    <span className={`dot ${done ? 'dot-done' : now ? 'dot-now' : 'dot-todo'}`}>{done && <CheckIcon size={12} />}</span>
                    {i < STEPS.length - 1 && <span className="rail" />}
                  </div>
                  <div className="stack-xs timeline-text">
                    <strong>{label}</strong>
                    <span className="muted small">{reached[status] ? fmtTime(reached[status]) : status === 'delivered' ? order.dueAt ? `By ${fmtTime(order.dueAt)}` : `By end of ${order.slot.label}` : ''}</span>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {order.delivery && !ended && (
          <section className="card person-card">
            <span className="avatar">{order.delivery.name?.charAt(0) || 'D'}</span>
            <span className="stack-xs grow">
              <strong>{order.delivery.name} will deliver</strong>
              <span className="muted small">{order.paymentMethod === 'upi' ? `Paid via UPI` : `Pay ${rupees(order.total)} on delivery`}</span>
            </span>
            <a href={`tel:${order.delivery.phone}`} className="icon-btn icon-btn-outline" aria-label={`Call ${order.delivery.name}`}><PhoneIcon size={20} /></a>
          </section>
        )}

        <section className="card stack-sm">
          <OrderItems order={order} />
          <div className="row-between bill-total">
            <span>{order.paymentStatus === 'paid' ? 'Paid' : 'To pay'}</span><span>{rupees(order.total)}</span>
          </div>
          <span className="muted small">{order.address}</span>
        </section>

        <ErrorNote>{error}</ErrorNote>
        {order.status === 'new' && (
          <button className="btn btn-outline" disabled={busy}
            onClick={() => window.confirm('Cancel this order?') && act(() => api(`/orders/${order.id}/cancel`, { method: 'POST' }))}>
            Cancel order
          </button>
        )}
      </div>
    </div>
  );
}
