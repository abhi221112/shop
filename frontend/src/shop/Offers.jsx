import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDay, fmtTime, rupees } from '../format';
import { BoltIcon, CheckIcon, ClockIcon, GiftIcon, LeafIcon, RepeatIcon, ShareIcon, TagIcon, TruckIcon } from '../components/Icons';
import { useAuth, useCart, useShop } from '../state';
import ProductCard from './ProductCard';

const on = (offers, key) => Boolean(offers?.[key]?.enabled);

/** Horizontal strip of what's on offer today (top of the home page). */
export function OfferStrip({ perks }) {
  const { offers, slots } = useShop();
  const { user } = useAuth();
  if (!offers) return null;
  const express = on(offers, 'express') && slots.find((s) => s.express && !s.full);
  const today = slots.find((s) => s.day === 'Today' && !s.express && !s.full);
  const showFirst = on(offers, 'firstOrder') && (!user || perks?.firstOrderEligible);
  const fo = offers.firstOrder;

  const cards = [
    on(offers, 'banner') && offers.banner.title && { key: 'banner', icon: TagIcon, tone: 'dark', title: offers.banner.title, text: offers.banner.text },
    express && { key: 'express', icon: BoltIcon, tone: 'yellow', title: `Delivered in ${express.minutes} minutes`, text: `Express delivery until ${express.orderBy}` },
    on(offers, 'freeDelivery') && { key: 'fd', icon: TruckIcon, tone: 'green', title: `Free delivery above ${rupees(offers.freeDelivery.min)}`, text: 'On every order, every day' },
    on(offers, 'freeGift') && { key: 'gift', icon: GiftIcon, tone: 'mint', title: `Free ${offers.freeGift.item}`, text: `On orders above ${rupees(offers.freeGift.min)}` },
    showFirst && {
      key: 'first', icon: TagIcon, tone: 'pink',
      title: fo.type === 'flat' ? `${rupees(fo.amount)} off your first order` : 'Free delivery on your first order',
      text: `On orders above ${rupees(fo.min)}`,
    },
    today && { key: 'today', icon: ClockIcon, tone: 'cream', title: `Order by ${today.orderBy}`, text: `For delivery today, ${today.label}` },
    on(offers, 'referral') && {
      key: 'refer', icon: ShareIcon, tone: 'blue', to: user ? '/refer' : '/login?next=/refer',
      title: `Refer a friend, get ${rupees(offers.referral.amount)}`, text: `They get ${rupees(offers.referral.amount)} too`,
    },
  ].filter(Boolean);
  if (!cards.length) return null;

  // The cards run as a looping ticker: the set is drawn twice and the track slides by exactly one set.
  const renderSet = (copy) => cards.map(({ key, icon: Icon, tone, title, text, to }) => {
    const body = (<><span className="offer-icon"><Icon size={20} /></span><span className="stack-xs"><strong>{title}</strong><span className="small">{text}</span></span></>);
    const props = { key: `${copy}-${key}`, className: `offer-card tone-${tone}`, ...(copy ? { 'aria-hidden': true, tabIndex: -1 } : {}) };
    return to ? <Link to={to} {...props}>{body}</Link> : <div {...props}>{body}</div>;
  });

  return (
    <section className="offer-marquee" aria-label="Offers">
      <div className="offer-track" style={{ '--marquee-duration': `${Math.max(16, cards.length * 5)}s` }}>
        {renderSet(0)}
        <span className="offer-clones" aria-hidden="true">{renderSet(1)}</span>
      </div>
    </section>
  );
}

export function PromiseStrip() {
  const { offers } = useShop();
  if (!on(offers, 'promise') || !offers.promise.text) return null;
  return (
    <div className="container">
      <p className="promise"><LeafIcon size={18} />{offers.promise.text}</p>
    </div>
  );
}

/** "Order again" with the customer's last order, one tap back into the cart. */
export function ReorderCard() {
  const { user } = useAuth();
  const { offers, products, combos } = useShop();
  const { add, addCombo } = useCart();
  const [last, setLast] = useState(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!user || !on(offers, 'reorder')) return;
    api('/orders/mine').then((list) => setLast(list.find((o) => o.status === 'delivered') || null)).catch(() => {});
  }, [user, offers]);
  if (!last) return null;

  const loose = last.items.filter((i) => !i.comboId);
  const comboCounts = {};
  for (const i of last.items) if (i.comboId) comboCounts[i.comboId] = i.comboCount || 1;
  const available = loose.filter((i) => {
    const p = products.find((x) => x.id === i.productId);
    return p && p.stock >= Number(i.qty);
  });
  const availableCombos = Object.entries(comboCounts).filter(([id]) => combos.find((c) => c.id === Number(id) && c.available));
  if (!available.length && !availableCombos.length) return null;

  function reorder() {
    available.forEach((i) => add(i.productId, Number(i.qty)));
    availableCombos.forEach(([id, n]) => addCombo(Number(id), n));
    setAdded(true);
  }
  const names = [...new Set(last.items.map((i) => i.comboName || i.name))];

  return (
    <section className="container section-tight">
      <div className="card reorder">
        <span className="offer-icon tone-green"><RepeatIcon size={20} /></span>
        <span className="stack-xs grow">
          <strong>Order again</strong>
          <span className="muted small">Your {fmtDay(last.slot.date).toLowerCase()} order: {names.slice(0, 4).join(', ')}{names.length > 4 ? ` +${names.length - 4} more` : ''}</span>
        </span>
        {added
          ? <Link to="/cart" className="btn btn-dark">View cart →</Link>
          : <button className="btn btn-primary" onClick={reorder}>Add all to cart</button>}
      </div>
    </section>
  );
}

/** Items cheaper than yesterday, biggest drop first. */
export function PriceDropRow() {
  const { offers, products } = useShop();
  if (!on(offers, 'priceDrops')) return null;
  const drops = products.filter((p) => p.priceDrop > 0 && p.stock >= p.step).sort((a, b) => b.priceDrop - a.priceDrop);
  if (!drops.length) return null;
  return (
    <section className="container section">
      <div className="section-head">
        <h2 className="section-title">Today's best prices</h2>
        <span className="muted small">Cheaper than yesterday</span>
      </div>
      <div className="h-scroll">
        {drops.map((p) => <div key={p.id} className="h-scroll-item"><ProductCard product={p} /></div>)}
      </div>
    </section>
  );
}

export function ComboCard({ combo }) {
  const { combos: inCart, addCombo, setComboCount } = useCart();
  const n = inCart[combo.id] || 0;
  return (
    <article className="combo-card">
      <div className="combo-top" style={{ background: combo.tint }}>
        {combo.savings > 0 && <span className="save-badge">Save {rupees(combo.savings)}</span>}
        <strong className="combo-name">{combo.name}</strong>
        {combo.description && <span className="small">{combo.description}</span>}
      </div>
      <ul className="combo-items">
        {combo.items.map((i) => <li key={i.productId}><span>{i.name}</span><span className="muted">{i.qtyLabel}</span></li>)}
      </ul>
      <div className="combo-foot">
        <span className="stack-xs">
          <strong className="big">{rupees(combo.price)}</strong>
          {combo.savings > 0 && <span className="muted small strike">{rupees(combo.regularPrice)}</span>}
        </span>
        {!combo.available ? (
          <button className="btn btn-disabled" disabled>Sold out today</button>
        ) : n ? (
          <div className="stepper">
            <button aria-label={`One less ${combo.name}`} onClick={() => setComboCount(combo.id, n - 1)}>−</button>
            <span>{n} in cart</span>
            <button aria-label={`One more ${combo.name}`} onClick={() => setComboCount(combo.id, n + 1)}>+</button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={() => addCombo(combo.id)}>Add combo</button>
        )}
      </div>
    </article>
  );
}

export function CombosRow() {
  const { offers, combos } = useShop();
  if (!on(offers, 'combos') || !combos.length) return null;
  return (
    <section className="container section">
      <div className="section-head">
        <h2 className="section-title">Combo packs</h2>
        <span className="muted small">Everyday sabzi, one tap, less money</span>
      </div>
      <div className="h-scroll">
        {combos.map((c) => <div key={c.id} className="h-scroll-item h-scroll-wide"><ComboCard combo={c} /></div>)}
      </div>
    </section>
  );
}

export function ReferCard() {
  const { offers } = useShop();
  const { user } = useAuth();
  if (!on(offers, 'referral')) return null;
  const amount = rupees(offers.referral.amount);
  return (
    <section className="container section">
      <Link to={user ? '/refer' : '/login?next=/refer'} className="refer-card">
        <span className="offer-icon"><ShareIcon size={22} /></span>
        <span className="stack-xs grow">
          <strong>Give {amount}, get {amount}</strong>
          <span className="small">Share your code with friends. They get {amount} off, and you get {amount} when their first order arrives.</span>
        </span>
        <span className="btn btn-yellow">Invite</span>
      </Link>
    </section>
  );
}

/** Progress bars: free delivery, free gift, first-order offer. */
export function OfferNudges({ quote }) {
  const { offers } = useShop();
  if (!quote || !offers) return null;
  const { nudges, goods } = quote;
  const rows = [];
  if (nudges.firstOrder) {
    const f = nudges.firstOrder;
    rows.push({ key: 'first', icon: TagIcon, pct: goods / f.min,
      text: <>Add <strong>{rupees(f.remaining)}</strong> more to get {f.type === 'flat' ? <strong>{rupees(f.amount)} off</strong> : <strong>free delivery</strong>} on your first order</> });
  }
  if (nudges.freeDelivery) {
    rows.push({ key: 'fd', icon: TruckIcon, pct: goods / nudges.freeDelivery.min,
      text: <>Add <strong>{rupees(nudges.freeDelivery.remaining)}</strong> more for <strong>FREE delivery</strong></> });
  } else if (on(offers, 'freeDelivery') || quote.freeDeliveryReason) {
    rows.push({ key: 'fd', icon: TruckIcon, done: true, text: <>You've unlocked <strong>free delivery</strong></> });
  }
  if (nudges.gift) {
    rows.push({ key: 'gift', icon: GiftIcon, pct: goods / nudges.gift.min,
      text: <>Add <strong>{rupees(nudges.gift.remaining)}</strong> more to get <strong>free {nudges.gift.item}</strong></> });
  } else if (quote.gift) {
    rows.push({ key: 'gift', icon: GiftIcon, done: true, text: <><strong>Free {quote.gift}</strong> will be added to your bag</> });
  }
  if (!rows.length) return null;
  return (
    <section className="card nudges">
      {rows.map(({ key, icon: Icon, text, pct, done }) => (
        <div key={key} className={`nudge ${done ? 'is-done' : ''}`}>
          <span className="nudge-icon">{done ? <CheckIcon size={14} /> : <Icon size={18} />}</span>
          <div className="stack-xs grow">
            <span className="small">{text}</span>
            {!done && <span className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, pct) * 100)}>
              <span style={{ width: `${Math.min(100, Math.max(4, pct * 100))}%` }} />
            </span>}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Bill from the server quote (cart & checkout) — identical to what the order will charge. */
export function BillDetails({ quote, slotLabel }) {
  if (!quote) return null;
  const q = quote;
  return (
    <section className="card bill">
      <h2 className="card-title">Bill details</h2>
      <div className="row-between"><span className="muted">Item total</span><span>{rupees(q.itemsTotal)}</span></div>
      {q.discountLines.map((d) => (
        <div key={d.label} className="row-between text-green"><span>{d.label}</span><span>−{rupees(d.amount)}</span></div>
      ))}
      <div className="row-between">
        <span className="muted">Delivery fee</span>
        <span>{q.deliveryFee ? rupees(q.deliveryFee) : <><span className="strike muted">{rupees(q.baseDeliveryFee)}</span> <strong className="text-green">FREE</strong></>}</span>
      </div>
      {q.slotFee > 0 && <div className="row-between"><span className="muted">{slotLabel || 'Slot charge'}</span><span>{rupees(q.slotFee)}</span></div>}
      {q.gift && <div className="row-between"><span className="muted">Free gift: {q.gift}</span><strong className="text-green">FREE</strong></div>}
      <div className="row-between bill-total"><span>To pay</span><span>{rupees(q.total)}</span></div>
      {q.discount > 0 && <span className="saved-note">You save {rupees(q.discount + (q.deliveryFee ? 0 : q.baseDeliveryFee))} on this order</span>}
      {!q.loggedIn && q.firstOrderDiscount > 0 && <span className="small muted">First-order offer applies if this is your first order.</span>}
    </section>
  );
}

export function WalletHistory({ items }) {
  if (!items?.length) return <p className="muted small">No wallet activity yet.</p>;
  return (
    <ul className="wallet-list">
      {items.map((t, i) => (
        <li key={i} className="row-between">
          <span className="stack-xs"><span>{t.reason}</span><span className="muted small">{fmtDay(t.at.slice(0, 10))} · {fmtTime(t.at)}</span></span>
          <strong className={t.amount > 0 ? 'text-green' : ''}>{t.amount > 0 ? '+' : '−'}{rupees(Math.abs(t.amount))}</strong>
        </li>
      ))}
    </ul>
  );
}
