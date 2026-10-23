import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, rupees } from '../format';
import { PinIcon } from '../components/Icons';
import { ErrorNote, PageHeader, Spinner } from '../components/ui';
import { payForOrder } from '../payments';
import { useAuth, useCart, useQuote, useShop } from '../state';
import AddressForm from './AddressForm';
import { BillDetails, OfferNudges } from './Offers';

export default function Checkout() {
  const { user, setUser } = useAuth();
  const { clear, count, payload } = useCart();
  const { reloadProducts } = useShop();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState(null);
  const [addressId, setAddressId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [slots, setSlots] = useState(null);
  const [slotKey, setSlotKey] = useState('');
  const [pay, setPay] = useState('upi');
  const [name, setName] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slotId, slotDate] = slotKey ? slotKey.split('|') : [];
  const { quote, error: quoteError } = useQuote(slotKey ? { slotId: Number(slotId), slotDate } : null);

  useEffect(() => {
    api('/addresses').then((a) => {
      setAddresses(a);
      setAddressId(a[0]?.id ?? null);
      setAdding(a.length === 0);
    }).catch((e) => setError(e.message));
    api('/slots').then((s) => {
      setSlots(s);
      const first = s.find((x) => !x.full && !x.express) || s.find((x) => !x.full);
      if (first) setSlotKey(`${first.slotId}|${first.date}`);
    }).catch((e) => setError(e.message));
  }, []);

  if (!count && !busy) return <Navigate to="/cart" replace />;

  const chosen = slots?.find((x) => `${x.slotId}|${x.date}` === slotKey);
  const express = slots?.filter((x) => x.express) || [];
  const scheduled = slots?.filter((x) => !x.express) || [];

  async function placeOrder() {
    setError('');
    if (!user.name && !name.trim()) return setError('Enter your name so the delivery person knows who to ask for');
    if (!addressId) return setError('Add a delivery address');
    if (!slotKey) return setError('Choose a delivery slot');
    setBusy(true);
    try {
      if (!user.name) setUser(await api('/auth/me', { method: 'PATCH', body: { name: name.trim() } }));
      const order = await api('/orders', {
        method: 'POST',
        body: { ...payload, addressId, slotId: Number(slotId), slotDate, paymentMethod: pay },
      });
      clear();
      reloadProducts();
      if (pay === 'upi') {
        try { await payForOrder(order, user); } catch { /* order page offers "Pay now" again */ }
      }
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Checkout" back="/cart" />
      <div className="page-body">
        {!user.name && (
          <label className="card field">
            <span className="card-title">Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="name" />
          </label>
        )}

        <section className="stack-sm">
          <h2 className="section-label">Deliver to</h2>
          {addresses === null && <Spinner />}
          {addresses?.map((a) => (
            <label key={a.id} className={`card address-option ${addressId === a.id ? 'is-on' : ''}`}>
              <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="sr-only" />
              <PinIcon />
              <span className="stack-xs">
                <strong>{a.label}</strong>
                <span className="muted small">{[a.line, a.landmark, a.pincode].filter(Boolean).join(', ')}</span>
              </span>
            </label>
          ))}
          {adding ? (
            <AddressForm
              onSaved={(a) => { setAddresses([...(addresses || []), a]); setAddressId(a.id); setAdding(false); }}
              onCancel={addresses?.length ? () => setAdding(false) : undefined}
            />
          ) : (
            <button className="link-btn" onClick={() => setAdding(true)}>+ Add a new address</button>
          )}
        </section>

        <section className="stack-sm">
          <h2 className="section-label">Delivery slot</h2>
          {slots === null && <Spinner />}
          {slots?.length === 0 && <p className="muted">No slots open right now. Please check again later.</p>}
          {express.map((s) => {
            const key = `${s.slotId}|${s.date}`;
            return (
              <button key={key} disabled={s.full} className={`slot slot-express ${slotKey === key ? 'is-on' : ''}`} onClick={() => setSlotKey(key)}>
                <span className="row-between">
                  <strong>{s.full ? 'Express · full right now' : `Express · arrives by ${fmtTime(new Date(Date.now() + s.minutes * 60000).toISOString())}`}</strong>
                  {s.fee > 0 && <span className="small strong">+{rupees(s.fee)}</span>}
                </span>
                <span className="small">Delivered within {s.minutes} minutes of ordering</span>
              </button>
            );
          })}
          <div className="slot-grid">
            {scheduled.map((s) => {
              const key = `${s.slotId}|${s.date}`;
              return (
                <button key={key} disabled={s.full} className={`slot ${slotKey === key ? 'is-on' : ''}`} onClick={() => setSlotKey(key)}>
                  <span className="small">{s.day}{s.full ? ' · Full' : s.anytime ? ` · order by ${s.orderBy}` : ''}</span>
                  <strong className={s.full ? 'strike' : ''}>{s.label}</strong>
                  {s.fee > 0 && <span className="small">+{rupees(s.fee)}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="stack-sm">
          <h2 className="section-label">Payment</h2>
          {[
            ['upi', 'UPI', 'GPay, PhonePe, Paytm or any UPI app'],
            ['cod', 'Cash on delivery', 'Pay cash or UPI to the delivery person'],
          ].map(([id, label, hint]) => (
            <label key={id} className={`card radio-card ${pay === id ? 'is-on' : ''}`}>
              <input type="radio" name="pay" checked={pay === id} onChange={() => setPay(id)} />
              <span className="stack-xs"><strong>{label}</strong><span className="muted small">{hint}</span></span>
            </label>
          ))}
        </section>

        <OfferNudges quote={quote} />
        <BillDetails quote={quote} slotLabel={chosen?.express ? 'Express delivery' : 'Slot charge'} />
        {quote?.walletUsed > 0 && (
          <p className="small muted">
            {rupees(quote.walletUsed)} of your {rupees(quote.walletBalance)} wallet credit is used on this order.
            {quote.walletBalance - quote.walletUsed > 0.5 && ` The remaining ${rupees(quote.walletBalance - quote.walletUsed)} is kept for your next orders${quote.walletUsable < quote.walletBalance ? ' (refunds are used a little at a time)' : ''}.`}
          </p>
        )}
        <ErrorNote>{error || quoteError}</ErrorNote>
      </div>

      <div className="action-bar action-bar-split">
        <div className="stack-xs">
          <span className="muted small">To pay</span>
          <strong className="big">{quote ? rupees(quote.total) : '…'}</strong>
        </div>
        <button className="btn btn-primary btn-lg grow" disabled={busy || !quote} onClick={placeOrder}>
          {busy ? 'Placing order…' : pay === 'upi' ? 'Pay with UPI' : 'Place order'}
        </button>
      </div>
    </div>
  );
}
