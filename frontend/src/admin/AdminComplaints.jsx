import { useCallback, useEffect, useState } from 'react';
import { api, assetUrl } from '../api';
import { fmtDay, fmtTime, rupees } from '../format';
import { ErrorNote, Spinner } from '../components/ui';

const TABS = [['pending', 'To check'], ['approved', 'Refunded'], ['rejected', 'Rejected'], ['', 'All']];

export default function AdminComplaints() {
  const [tab, setTab] = useState('pending');
  const [list, setList] = useState(null);
  const [spreadDefault, setSpreadDefault] = useState(3);
  const [zoom, setZoom] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/admin/complaints${tab ? `?status=${tab}` : ''}`).then(setList).catch((e) => setError(e.message));
  }, [tab]);
  useEffect(() => { setList(null); load(); }, [load]);
  useEffect(() => {
    api('/admin/offers').then((o) => setSpreadDefault(o.refunds?.spreadOrders || 3)).catch(() => {});
  }, []);

  return (
    <div className="stack page-narrow-desktop">
      <div className="stack-xs">
        <h1 className="page-title">Complaints</h1>
        <span className="muted">Customers report bad items with photos. Check them, then refund to their wallet or reply with a reason.</span>
      </div>
      <div role="tablist" aria-label="Status" className="row gap wrap">
        {TABS.map(([id, label]) => (
          <button key={id || 'all'} role="tab" aria-selected={tab === id} className={`chip chip-dark ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      {list === null ? <Spinner /> : list.length === 0 ? (
        <p className="muted">{tab === 'pending' ? 'Nothing to check right now.' : 'No reports here.'}</p>
      ) : list.map((c) => <ComplaintCard key={c.id} c={c} spreadDefault={spreadDefault} onZoom={setZoom} onDone={load} />)}

      {zoom && (
        <button className="photo-zoom" onClick={() => setZoom(null)} aria-label="Close photo">
          <img src={assetUrl(zoom)} alt="Customer photo, enlarged" />
        </button>
      )}
    </div>
  );
}

function ComplaintCard({ c, spreadDefault, onZoom, onDone }) {
  const [amount, setAmount] = useState(String(Math.min(c.suggestedRefund, c.orderTotal)));
  const [spread, setSpread] = useState(String(spreadDefault));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setSpread(String(spreadDefault)), [spreadDefault]);

  const n = Math.max(1, Number(spread) || 1);
  const perOrder = n > 1 ? Math.ceil((Number(amount) || 0) / n) : Number(amount) || 0;

  async function act(kind) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/complaints/${c.id}/${kind}`, {
        method: 'POST',
        body: kind === 'approve' ? { amount: Number(amount), spreadOrders: n, note } : { note },
      });
      onDone();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <article className={`card stack-sm complaint ${c.status}`}>
      <div className="row-between wrap">
        <span className="stack-xs">
          <strong>#{c.orderCode} · {c.customerName}</strong>
          <span className="muted small">
            <a href={`tel:${c.customerPhone}`}>{c.customerPhone}</a> · delivered {fmtDay(c.slotDate).toLowerCase()} · reported {fmtDay(c.createdAt.slice(0, 10)).toLowerCase()} {fmtTime(c.createdAt)}
          </span>
        </span>
        <span className="stack-xs align-end">
          <span className="small">Order total <strong>{rupees(c.orderTotal)}</strong></span>
          {c.customerComplaints > 1 && <span className="small text-red strong">{c.customerComplaints} reports from this customer</span>}
        </span>
      </div>

      <div className="stack-xs">
        <span className="small strong">Items reported</span>
        {c.items.map((i) => (
          <div key={i.orderItemId} className="row-between small"><span>{i.name} · {i.qtyLabel}{i.comboName ? ` (${i.comboName})` : ''}</span><span>{rupees(i.lineTotal)}</span></div>
        ))}
      </div>
      <p className="complaint-text">“{c.text}”</p>
      <div className="photo-row">
        {c.photos.map((p, idx) => (
          <button key={p} type="button" className="photo-btn-plain" onClick={() => onZoom(p)} aria-label={`Open photo ${idx + 1}`}>
            <img src={assetUrl(p)} alt={`Customer photo ${idx + 1}`} className="photo-thumb photo-thumb-lg" />
          </button>
        ))}
      </div>

      {c.status === 'pending' ? (
        <div className="stack-sm decide">
          <div className="form-grid">
            <label className="field"><span>Refund to wallet</span>
              <span className="money-input"><span>₹</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></span>
              <span className="time-hint">Reported items total {rupees(c.suggestedRefund)}</span>
            </label>
            <label className="field"><span>Can be used over</span>
              <select className="input" value={spread} onChange={(e) => setSpread(e.target.value)}>
                {Array.from({ length: 10 }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k === 1 ? '1 order (all at once)' : `${k} orders`}</option>)}
              </select>
              <span className="time-hint">{n > 1 ? `Up to ${rupees(perOrder)} per order` : 'Whole amount on the next order'}</span>
            </label>
            <label className="field span-2"><span>Note to customer (needed to reject)</span>
              <input className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sorry! We've also told our supplier." />
            </label>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="row gap wrap">
            <button className="btn btn-primary" disabled={busy || !(Number(amount) > 0)} onClick={() => act('approve')}>Approve · refund {rupees(Number(amount) || 0)}</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => act('reject')}>Reject</button>
          </div>
        </div>
      ) : (
        <div className={`small strong ${c.status === 'approved' ? 'text-green' : 'text-red'}`}>
          {c.status === 'approved'
            ? `Refunded ${rupees(c.refundAmount)}${c.spreadOrders > 1 ? `, usable over ${c.spreadOrders} orders` : ''}`
            : 'Rejected'}
          {c.adminNote ? ` · “${c.adminNote}”` : ''}
        </div>
      )}
    </article>
  );
}
