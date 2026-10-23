import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fmtDay, rupees, STATUS_CHIP, STATUS_LABEL } from '../format';
import { ErrorNote, Spinner } from '../components/ui';

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function AdminCustomers() {
  const [q, setQ] = useState('');
  const [customers, setCustomers] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/admin/customers?q=${encodeURIComponent(q)}`).then(setCustomers).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="stack">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Customers</h1>
          <span className="muted">{customers ? `${customers.length} customers` : ' '}</span>
        </div>
      </div>
      <input className="input input-search" aria-label="Search by name or phone" placeholder="Search by name or phone"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorNote>{error}</ErrorNote>
      {customers === null ? <Spinner /> : (
        <div className="table-box">
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Address</th><th>Orders</th><th>Total spent</th><th>Last order</th><th>Joined</th><th><span className="sr-only">Details</span></th></tr>
            </thead>
            <tbody>
              {customers.length === 0 && <tr><td colSpan={7} className="muted center">No customers found.</td></tr>}
              {customers.map((c) => (
                <CustomerRow key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomerRow({ c, open, onToggle }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    if (open && !orders) api(`/admin/customers/${c.id}/orders`).then(setOrders).catch(() => setOrders([]));
  }, [open, orders, c.id]);

  return (
    <>
      <tr>
        <td><strong>{c.name || 'No name yet'}</strong><div className="muted small"><a href={`tel:${c.phone}`}>{c.phone}</a></div></td>
        <td className="items-cell">{c.address || <span className="muted">—</span>}</td>
        <td>{c.orders}</td>
        <td><strong>{rupees(c.spent)}</strong></td>
        <td>{shortDate(c.lastOrder)}</td>
        <td className="muted">{shortDate(c.joined)}</td>
        <td className="actions-cell">
          {c.orders > 0 && <button className="btn btn-sm btn-outline" aria-expanded={open} onClick={onToggle}>{open ? 'Hide orders' : 'Orders'}</button>}
        </td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            {!orders ? <Spinner /> : (
              <div className="stack-sm">
                {orders.map((o) => (
                  <div key={o.id} className="row-between wrap detail-order">
                    <span><strong>#{o.code}</strong> · {fmtDay(o.slot.date)} {o.slot.label}</span>
                    <span className="muted small items-cell">{[...new Set(o.items.map((i) => i.comboName ? `${i.comboName}${i.comboCount > 1 ? ` ×${i.comboCount}` : ''}` : `${i.name} ${i.qtyLabel}`))].join(', ')}</span>
                    <span className="row gap-sm">
                      <strong>{rupees(o.total)}</strong>
                      <span className={`chip-status ${STATUS_CHIP[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                    </span>
                  </div>
                ))}
                <Link to="/admin" className="small">Go to today's orders →</Link>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
