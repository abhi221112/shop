import { rupees } from '../format';

/** Order lines with combo items grouped under their pack, then discounts, fees and the free gift. */
export default function OrderItems({ order, prices = true }) {
  const loose = order.items.filter((i) => !i.comboId && !i.comboName);
  const groups = {};
  for (const i of order.items) {
    if (!i.comboName) continue;
    (groups[i.comboName] ||= { name: i.comboName, count: i.comboCount || 1, items: [] }).items.push(i);
  }
  return (
    <div className="stack-sm order-items">
      {Object.values(groups).map((g) => (
        <div key={g.name} className="stack-xs">
          <strong>{g.name}{g.count > 1 ? ` × ${g.count}` : ''}</strong>
          {g.items.map((i) => (
            <div key={i.id} className="row-between combo-sub"><span>{i.name} · {i.qtyLabel}</span>{prices && <span className="muted">{rupees(i.lineTotal)}</span>}</div>
          ))}
        </div>
      ))}
      {loose.map((i) => (
        <div key={i.id} className="row-between">
          <span>{i.name} · {i.qtyLabel}{i.bulk && <span className="bulk-tag">Bulk rate</span>}</span>
          {prices && <span>{rupees(i.lineTotal)}</span>}
        </div>
      ))}
      {order.gift && <div className="row-between gift-line"><span>Free gift · {order.gift}</span>{prices && <strong>FREE</strong>}</div>}
      {prices && (
        <>
          {(order.discountLines || []).map((d) => (
            <div key={d.label} className="row-between text-green"><span>{d.label}</span><span>−{rupees(d.amount)}</span></div>
          ))}
          {order.deliveryFee > 0 && <div className="row-between muted"><span>Delivery fee</span><span>{rupees(order.deliveryFee)}</span></div>}
        </>
      )}
    </div>
  );
}
