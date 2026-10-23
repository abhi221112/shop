import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { fmtQty, localDate, rupees } from '../format';
import { ErrorNote, Spinner } from '../components/ui';

export default function PackingList() {
  const [params] = useSearchParams();
  const date = params.get('date') || localDate();
  const slotId = params.get('slotId');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/admin/orders?date=${date}${slotId ? `&slotId=${slotId}` : ''}`)
      .then((o) => setOrders(o.filter((x) => ['new', 'confirmed'].includes(x.status) && !(x.paymentMethod === 'upi' && x.paymentStatus !== 'paid'))))
      .catch((e) => setError(e.message));
  }, [date, slotId]);

  const totals = {};
  for (const o of orders || []) {
    for (const i of o.items) {
      const key = `${i.name}|${i.unit}`;
      totals[key] = { name: i.name, unit: i.unit, qty: (totals[key]?.qty || 0) + Number(i.qty) };
    }
  }
  const rows = Object.values(totals).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="print-page">
      <div className="row gap no-print">
        <Link to="/admin" className="btn btn-outline">← Back</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>
      <h1>Packing list · {date}{orders?.[0] && slotId ? ` · ${orders[0].slot.label}` : ''}</h1>
      <ErrorNote>{error}</ErrorNote>
      {!orders ? <Spinner /> : orders.length === 0 ? <p>Nothing to pack. (Only new and confirmed orders that are paid or cash-on-delivery are listed.)</p> : (
        <>
          <h2>Total to weigh out ({orders.length} orders)</h2>
          <table className="table print-table">
            <thead><tr><th>Vegetable</th><th>Total</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.name + r.unit}><td>{r.name}</td><td><strong>{fmtQty(r.qty, r.unit)}</strong></td></tr>)}</tbody>
          </table>
          {orders.some((o) => o.gift) && (
            <p><strong>Free gifts to pack:</strong> {Object.entries(orders.filter((o) => o.gift).reduce((m, o) => ({ ...m, [o.gift]: (m[o.gift] || 0) + 1 }), {})).map(([g, n]) => `${n} × ${g}`).join(', ')}</p>
          )}
          <h2>Bags</h2>
          {orders.map((o) => (
            <div key={o.id} className="bag">
              <strong>#{o.code} · {o.customerName} · {o.slot.label}</strong>
              <div className="small">{o.address} · {o.customerPhone}</div>
              <ul>
                {o.items.map((i) => <li key={i.id}>☐ {i.name} — {i.qtyLabel}{i.comboName ? ` (${i.comboName})` : ''}</li>)}
                {o.gift && <li>☐ <strong>FREE GIFT: {o.gift}</strong></li>}
              </ul>
              <div className="small">{o.paymentMethod === 'cod' ? `Collect ${rupees(o.total)} cash` : 'Paid by UPI'}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
