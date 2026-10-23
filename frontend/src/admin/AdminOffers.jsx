import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { rupees } from '../format';
import { ErrorNote, Spinner, Toggle } from '../components/ui';
import { useShop } from '../state';

/** One offer: title, on/off switch, what customers see, and its settings. */
function Offer({ title, hint, value, onToggle, children }) {
  return (
    <section className={`card stack-sm offer-admin ${value.enabled ? '' : 'is-off'}`}>
      <div className="row-between wrap">
        <span className="stack-xs"><strong>{title}</strong><span className="muted small">{hint}</span></span>
        <Toggle on={value.enabled} onChange={onToggle} label={`${title} on or off`} onText="On" offText="Off" />
      </div>
      {value.enabled && children && <div className="form-grid">{children}</div>}
    </section>
  );
}

const Money = ({ label, value, onChange }) => (
  <label className="field"><span>{label}</span>
    <span className="money-input"><span>₹</span><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} /></span>
  </label>
);

export default function AdminOffers() {
  const { reloadProducts } = useShop();
  const [o, setO] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api('/admin/offers').then((v) => { setO(v); setSaved(JSON.stringify(v)); }).catch((e) => setError(e.message));
  }, []);
  if (!o) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;

  const set = (key, field, value) => { setO({ ...o, [key]: { ...o[key], [field]: value } }); setNotice(''); };
  const toggle = (key) => (v) => set(key, 'enabled', v);
  const dirty = JSON.stringify(o) !== saved;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const v = await api('/admin/offers', { method: 'PUT', body: o });
      setO(v);
      setSaved(JSON.stringify(v));
      setNotice('Saved. Offers are live on the app and website.');
      reloadProducts();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack page-narrow-desktop">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Offers</h1>
          <span className="muted">Switch offers on or off and set the amounts. Customers see them on the home page, cart and checkout.</span>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save offers' : 'Saved'}</button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="ok-note" role="status">{notice}</p>}

      <h2 className="section-label">Order more</h2>
      <Offer title="Free delivery" hint={`Delivery is free when the order is at least ${rupees(o.freeDelivery.min || 0)}. The cart shows "Add ₹X more for FREE delivery".`}
        value={o.freeDelivery} onToggle={toggle('freeDelivery')}>
        <Money label="Free delivery on orders above" value={o.freeDelivery.min} onChange={(v) => set('freeDelivery', 'min', v)} />
      </Offer>
      <Offer title="Free gift" hint="A small free item (e.g. dhaniya) added to bigger orders. It shows on the packing list and the delivery bag."
        value={o.freeGift} onToggle={toggle('freeGift')}>
        <label className="field"><span>Free item</span><input className="input" value={o.freeGift.item} onChange={(e) => set('freeGift', 'item', e.target.value)} placeholder="Dhaniya (1 bunch)" /></label>
        <Money label="On orders above" value={o.freeGift.min} onChange={(v) => set('freeGift', 'min', v)} />
      </Offer>
      <Offer title="Combo packs" hint="Ready-made packs at a lower price, shown on the home page." value={o.combos} onToggle={toggle('combos')}>
        <span className="small span-all"><Link to="/admin/combos">Create and edit combo packs →</Link></span>
      </Offer>
      <Offer title="Today's best prices" hint="Items whose price you lowered today get a “₹X cheaper today” badge and a row at the top of the home page."
        value={o.priceDrops} onToggle={toggle('priceDrops')} />
      <Offer title="Order again" hint="Shows customers their last order with one “Add all to cart” button." value={o.reorder} onToggle={toggle('reorder')} />
      <Offer title="“Only a few left”" hint="Items at or below their low-stock level show “Only 2 kg left”." value={o.lowStock} onToggle={toggle('lowStock')} />

      <h2 className="section-label">New customers</h2>
      <Offer title="First order offer" hint="For customers who have never ordered. Shown on the home page and applied automatically at checkout."
        value={o.firstOrder} onToggle={toggle('firstOrder')}>
        <label className="field"><span>Offer</span>
          <select className="input" value={o.firstOrder.type} onChange={(e) => set('firstOrder', 'type', e.target.value)}>
            <option value="flat">₹ off the order</option>
            <option value="free_delivery">Free delivery</option>
          </select>
        </label>
        {o.firstOrder.type === 'flat' && <Money label="Discount" value={o.firstOrder.amount} onChange={(v) => set('firstOrder', 'amount', v)} />}
        <Money label="Minimum order" value={o.firstOrder.min} onChange={(v) => set('firstOrder', 'min', v)} />
      </Offer>
      <Offer title="Refer a friend" hint="The friend gets wallet credit when they sign up with a customer's code; the customer gets the same when the friend's first order is delivered. Credit is used automatically at checkout."
        value={o.referral} onToggle={toggle('referral')}>
        <Money label="Reward for each (₹)" value={o.referral.amount} onChange={(v) => set('referral', 'amount', v)} />
      </Offer>

      <h2 className="section-label">Refunds for bad items</h2>
      <Offer title="Report a problem with photos" hint="After delivery, customers can report spoiled or missing items with photos. You check them under Complaints and refund to their wallet."
        value={o.refunds} onToggle={toggle('refunds')}>
        <label className="field"><span>Customers can report for</span>
          <select className="input" value={o.refunds.windowDays} onChange={(e) => set('refunds', 'windowDays', Number(e.target.value))}>
            {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'} after delivery</option>)}
          </select>
        </label>
        <label className="field"><span>Refund can be used over</span>
          <select className="input" value={o.refunds.spreadOrders} onChange={(e) => set('refunds', 'spreadOrders', Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k === 1 ? '1 order (all at once)' : `${k} orders`}</option>)}
          </select>
        </label>
        <span className="small muted span-all">
          {o.refunds.spreadOrders > 1
            ? `Example: a ₹90 refund can be used ₹${Math.ceil(90 / o.refunds.spreadOrders)} at a time over ${o.refunds.spreadOrders} orders. You can change this for each refund when you approve it.`
            : 'The whole refund can be used on the next order. You can change this for each refund when you approve it.'}
        </span>
      </Offer>

      <h2 className="section-label">Trust & urgency</h2>
      <Offer title="Freshness promise" hint="A line shown under the offers on the home page." value={o.promise} onToggle={toggle('promise')}>
        <label className="field span-all"><span>Text</span><input className="input" maxLength={160} value={o.promise.text} onChange={(e) => set('promise', 'text', e.target.value)} /></label>
      </Offer>
      <Offer title="Express badge" hint="Shows “Delivered in 30 minutes” when Express delivery is open (turn Express on under Delivery slots)."
        value={o.express} onToggle={toggle('express')} />
      <Offer title="Your own announcement" hint="Any message, e.g. “Diwali special: 10% extra on every order”. Shown first on the home page."
        value={o.banner} onToggle={toggle('banner')}>
        <label className="field"><span>Title</span><input className="input" maxLength={60} value={o.banner.title} onChange={(e) => set('banner', 'title', e.target.value)} placeholder="Fresh mangoes are here" /></label>
        <label className="field"><span>Text</span><input className="input" maxLength={160} value={o.banner.text} onChange={(e) => set('banner', 'text', e.target.value)} placeholder="Alphonso and Kesar, from ₹120/kg" /></label>
      </Offer>

      <div className="row gap">
        <button className="btn btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save offers' : 'Saved'}</button>
      </div>
    </div>
  );
}
