import { Link } from 'react-router-dom';
import { fmtQty, hasBulk, rupees, unitLabel } from '../format';
import { InfoIcon } from '../components/Icons';
import { ErrorNote, PageHeader, ProductImage, Spinner } from '../components/ui';
import { useBill, useCart, useQuote } from '../state';
import { BillDetails, OfferNudges } from './Offers';

export default function Cart() {
  const { setQty, setComboCount, count } = useCart();
  const { items, comboLines } = useBill();
  const { quote, error, loading } = useQuote();

  return (
    <div className="page-narrow">
      <PageHeader title="Your cart" back="/" />
      <div className="page-body">
        {!count ? (
          <div className="empty-state">
            <p>Your cart is empty.</p>
            <Link to="/" className="btn btn-primary">Browse vegetables</Link>
          </div>
        ) : (
          <>
            <OfferNudges quote={quote} />
            <section className="card cart-list">
              {comboLines.map(({ combo, count: n }) => (
                <div key={`c${combo.id}`} className="cart-line">
                  <div className="thumb combo-thumb" style={{ background: combo.tint }} aria-hidden="true">{n}×</div>
                  <div className="cart-line-info">
                    <strong>{combo.name}</strong>
                    <span className="muted small">{combo.items.map((i) => `${i.name} ${i.qtyLabel}`).join(', ')}</span>
                    {combo.savings > 0 && <span className="small text-green strong">You save {rupees(combo.savings * n)}</span>}
                  </div>
                  <div className="cart-line-right">
                    <div className="stepper">
                      <button aria-label={`One less ${combo.name}`} onClick={() => setComboCount(combo.id, n - 1)}>−</button>
                      <span>{n} pack{n > 1 ? 's' : ''}</span>
                      <button aria-label={`One more ${combo.name}`} onClick={() => setComboCount(combo.id, n + 1)}>+</button>
                    </div>
                    <strong>{rupees(combo.price * n)}</strong>
                  </div>
                </div>
              ))}
              {items.map(({ product: p, qty, price, bulk, lineTotal }) => (
                <div key={p.id} className="cart-line">
                  <ProductImage product={p} className="thumb" />
                  <div className="cart-line-info">
                    <strong>{p.name}</strong>
                    <span className="muted small">
                      {bulk && <s>{rupees(p.price)}</s>} {rupees(price)} {unitLabel(p.unit)}
                      {bulk && <span className="bulk-tag">Bulk rate</span>}
                    </span>
                    {bulk && <span className="small text-green strong">You save {rupees(qty * (p.price - price))}</span>}
                    {!bulk && hasBulk(p) && qty >= p.bulkMin / 2 && (
                      <span className="small text-green strong">Add {fmtQty(p.bulkMin - qty, p.unit)} more for {rupees(p.bulkPrice)} {unitLabel(p.unit)}</span>
                    )}
                  </div>
                  <div className="cart-line-right">
                    <div className="stepper">
                      <button aria-label={`Less ${p.name}`} onClick={() => setQty(p.id, qty - p.step)}>−</button>
                      <span>{fmtQty(qty, p.unit)}</span>
                      <button aria-label={`More ${p.name}`} disabled={qty + p.step > p.stock + 1e-9} onClick={() => setQty(p.id, qty + p.step)}>+</button>
                    </div>
                    <strong>{rupees(lineTotal)}</strong>
                  </div>
                </div>
              ))}
              <p className="weigh-note">
                <InfoIcon size={16} />
                Vegetables are weighed when packed. Your final bill may change slightly; the shop settles any difference on delivery.
              </p>
            </section>
            <ErrorNote>{error}</ErrorNote>
            {loading && !quote ? <Spinner label="Working out your bill…" /> : <BillDetails quote={quote} />}
            <Link to="/" className="add-more">+ Add more vegetables</Link>
          </>
        )}
      </div>
      {count > 0 && (
        <div className="action-bar">
          <Link to="/checkout" className={`btn btn-primary btn-lg btn-block ${error ? 'is-disabled-link' : ''}`} aria-disabled={Boolean(error)}>
            Choose delivery slot →
          </Link>
        </div>
      )}
    </div>
  );
}
