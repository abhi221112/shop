import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtTime, rupees } from '../format';
import { BellIcon, GiftIcon, SearchIcon, TruckIcon } from '../components/Icons';
import { ErrorNote, Spinner } from '../components/ui';
import { useAuth, useBill, useCart, usePerks, useShop } from '../state';
import { categoriesOf, matches } from './catalog';
import { CombosRow, OfferStrip, PriceDropRow, PromiseStrip, ReferCard, ReorderCard } from './Offers';
import ProductCard from './ProductCard';

export default function Home() {
  const { products, updatedAt, loading, error } = useShop();
  const perks = usePerks();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const cat = params.get('cat') || 'All';
  const categories = useMemo(() => categoriesOf(products), [products]);
  const shown = products.filter((p) => (cat === 'All' || p.category === cat) && matches(p, q));
  const browsing = q || cat !== 'All';

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    next.delete('ref');
    setParams(next, { replace: true });
  };

  return (
    <>
      <MobileHeader q={q} onSearch={(v) => setParam('q', v)} />
      <Hero />
      {!browsing && (
        <>
          <OfferStrip perks={perks} />
          <PromiseStrip />
          <BulkCard />
          <ReorderCard />
          <PriceDropRow />
          <CombosRow />
        </>
      )}

      <nav aria-label="Categories" className="chips mobile-only">
        {['All', ...categories.map((c) => c.key)].map((key) => (
          <button key={key} className={`chip ${cat === key ? 'is-on' : ''}`} onClick={() => setParam('cat', key)}>
            {key === 'All' ? 'All' : categories.find((c) => c.key === key)?.label}
          </button>
        ))}
      </nav>

      <section className="container section desktop-only">
        <h2 className="section-title">Shop by category</h2>
        <div className="category-grid">
          {categories.map((c) => (
            <button key={c.key} className={`category-tile ${cat === c.key ? 'is-on' : ''}`} style={{ background: c.tint }}
              onClick={() => setParam('cat', cat === c.key ? 'All' : c.key)}>
              <strong>{c.label}</strong>
              <span>{c.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="container section" id="prices">
        <div className="section-head">
          <h2 className="section-title">{q ? `Results for “${q}”` : "Today's fresh prices"}</h2>
          {updatedAt && <span className="muted small">Updated {fmtTime(updatedAt)}</span>}
        </div>
        {loading && <Spinner />}
        <ErrorNote>{error}</ErrorNote>
        {!loading && !shown.length && !error && <p className="empty">No vegetables match. Try another name.</p>}
        <div className="product-grid">
          {shown.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {!browsing && <ReferCard />}
      <HowItWorks />
      <CartBar />
    </>
  );
}

function MobileHeader({ q, onSearch }) {
  const { user } = useAuth();
  const { config } = useShop();
  const [address, setAddress] = useState(null);
  useEffect(() => {
    if (user) api('/addresses').then((a) => setAddress(a[0] || null)).catch(() => {});
  }, [user]);

  return (
    <header className="app-header mobile-only">
      <div className="app-header-row">
        <Link to="/" className="app-header-logo"><img src="/logo.webp" alt={config.shopName} /></Link>
        <Link to="/orders" className="icon-btn icon-btn-green" aria-label="My orders and updates"><BellIcon size={20} /></Link>
      </div>
      <Link to={user ? '/account' : '/login'} className="app-header-address">
        <span className="small">Deliver to · {address?.label || 'Home'}</span>
        <strong>{address ? address.line : user ? 'Add your address' : 'Log in to set address'}</strong>
      </Link>
      <label className="search">
        <SearchIcon size={18} />
        <input aria-label="Search vegetables" placeholder="Search tomato, palak, bhindi…" value={q} onChange={(e) => onSearch(e.target.value)} />
      </label>
    </header>
  );
}

function Hero() {
  const [pin, setPin] = useState('');
  const [result, setResult] = useState(null);

  async function check(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return setResult({ ok: false, text: 'Enter a 6-digit pincode' });
    const r = await api(`/pincode/${pin}`).catch(() => null);
    setResult(r?.serviceable ? { ok: true, text: `Yes! We deliver to ${pin}.` } : { ok: false, text: `Sorry, we don't deliver to ${pin} yet.` });
  }

  return (
    <section className="hero desktop-only">
      <div className="container hero-row">
        <div className="hero-copy">
          <span className="pill pill-yellow">Fresh from the mandi every morning</span>
          <h1>Your local vegetable shop, now at your door.</h1>
          <p>Order anytime between 5 AM and 10 PM and pick a delivery slot that suits you. Pay by UPI or cash. Prices updated daily, weighed fairly.</p>
          <form className="pin-form" onSubmit={check}>
            <label>
              <span>Check if we deliver to you</span>
              <input inputMode="numeric" maxLength={6} placeholder="Enter your pincode" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
            </label>
            <button className="btn btn-yellow btn-lg">Check</button>
          </form>
          {result && <p className={`pin-result ${result.ok ? 'ok' : ''}`} role="status">{result.text}</p>}
        </div>
        <a href="#prices" className="hero-visual">
          <span>See today's prices ↓</span>
        </a>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    ['Pick your vegetables', 'Choose by weight, from 100 g to 5 kg, or by bunch.'],
    ['Choose a delivery slot', 'Morning or evening, today or tomorrow.'],
    ['Get it fresh at home', 'Pay by UPI or cash. Track your order live.'],
  ];
  return (
    <section className="container section desktop-only">
      <h2 className="section-title">How it works</h2>
      <ol className="steps-grid">
        {steps.map(([title, text], i) => (
          <li key={title} className="card step-card">
            <span className="step-num">{i + 1}</span>
            <strong>{title}</strong>
            <span className="muted">{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Floating cart button with the next offer to unlock ("Add ₹35 more for FREE delivery"). */
function CartBar() {
  const { count } = useCart();
  const { goods } = useBill();
  const { offers } = useShop();
  if (!count) return null;
  let hint = null;
  if (offers?.freeDelivery?.enabled && goods < offers.freeDelivery.min) {
    hint = <><TruckIcon size={14} /> Add {rupees(offers.freeDelivery.min - goods)} more for FREE delivery</>;
  } else if (offers?.freeGift?.enabled && goods < offers.freeGift.min) {
    hint = <><GiftIcon size={14} /> Add {rupees(offers.freeGift.min - goods)} more for free {offers.freeGift.item}</>;
  } else if (offers?.freeGift?.enabled) {
    hint = <><GiftIcon size={14} /> Free delivery + free {offers.freeGift.item} unlocked</>;
  } else if (offers?.freeDelivery?.enabled) {
    hint = <><TruckIcon size={14} /> Free delivery unlocked</>;
  }
  return (
    <Link to="/cart" className="cart-bar">
      <span className="stack-xs">
        <span>{count} {count === 1 ? 'item' : 'items'} · {rupees(goods)}</span>
        {hint && <span className="cart-bar-hint">{hint}</span>}
      </span>
      <span>View cart →</span>
    </Link>
  );
}

/** Entry to bulk buying: daily bulk rates and event (wedding, anniversary…) orders. */
function BulkCard() {
  return (
    <section className="container section">
      <Link to="/bulk" className="bulk-card">
        <span className="offer-icon"><TruckIcon size={22} /></span>
        <span className="stack-xs grow">
          <strong>Buying in bulk?</strong>
          <span className="small">Special rates on potato, onion, chilli, ginger &amp; more. Wedding, anniversary or puja? Send us your list.</span>
        </span>
        <span className="btn btn-yellow">Bulk order</span>
      </Link>
    </section>
  );
}
