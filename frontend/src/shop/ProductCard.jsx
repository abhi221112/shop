import { useState } from 'react';
import { fmtQty, qtyOptions, rupees, unitLabel } from '../format';
import { ProductImage } from '../components/ui';
import { useCart, useShop } from '../state';
import { ArrowDownIcon } from '../components/Icons';

export default function ProductCard({ product }) {
  const { lines, add } = useCart();
  const { offers } = useShop();
  const options = qtyOptions(product);
  const [qty, setQty] = useState(options[0]);
  const inCart = lines[product.id] || 0;
  const left = product.stock - inCart;
  const soldOut = product.stock < product.step;
  const drop = offers?.priceDrops?.enabled && product.priceDrop > 0;
  const fewLeft = offers?.lowStock?.enabled && !soldOut && product.stock <= product.lowStockAt;

  return (
    <article className="product-card">
      <div className="product-media">
        <ProductImage product={product} />
        {drop && <span className="badge badge-drop"><ArrowDownIcon size={12} />{rupees(product.priceDrop)} cheaper today</span>}
      </div>
      <div className="product-head">
        <span className="product-name-wrap">
          <span className="product-name">{product.name}</span>
          {product.localName && <span className="muted small">{product.localName}</span>}
        </span>
        <span className="product-price">
          {rupees(product.price)} <span className="muted small">{unitLabel(product.unit)}</span>
        </span>
      </div>
      {soldOut ? (
        <button className="btn btn-disabled" disabled>Sold out today</button>
      ) : (
        <div className="product-actions">
          <label className="qty-select">
            <span className="sr-only">Quantity of {product.name}</span>
            <select value={qty} onChange={(e) => setQty(Number(e.target.value))}>
              {options.map((o) => <option key={o} value={o}>{fmtQty(o, product.unit)}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" disabled={qty > left + 1e-9} onClick={() => add(product.id, qty)}>Add</button>
        </div>
      )}
      {fewLeft && <span className="few-left">Only {fmtQty(product.stock, product.unit)} left</span>}
      {inCart > 0 && <span className="in-cart">In cart: {fmtQty(inCart, product.unit)}</span>}
    </article>
  );
}
