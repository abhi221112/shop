import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, assetUrl } from '../api';
import { rupees } from '../format';
import { ErrorNote } from '../components/ui';
import { shrinkImage } from '../admin/image';
import { useShop } from '../state';

const MAX_PHOTOS = 3;

/** After delivery: "Got everything?" → pick bad items, describe, add photos → the shop checks and may refund. */
export default function ReportProblem({ order, onUpdate }) {
  const { offers } = useShop();
  const c = order.complaint;
  if (c) return <ComplaintStatus complaint={c} />;
  if (offers && !offers.refunds?.enabled) return null;
  return <ReportForm order={order} onUpdate={onUpdate} windowDays={offers?.refunds?.windowDays} />;
}

function ComplaintStatus({ complaint: c }) {
  const tone = c.status === 'approved' ? 'ok-card' : c.status === 'rejected' ? 'muted-card' : 'warn-card';
  return (
    <section className={`card stack-sm ${tone}`}>
      <strong>
        {c.status === 'pending' && 'Your report is being checked'}
        {c.status === 'approved' && `${rupees(c.refundAmount)} refunded to your wallet`}
        {c.status === 'rejected' && 'Refund not approved'}
      </strong>
      <span className="small">
        {c.status === 'pending' && 'The shop is looking at your photos and will reply soon.'}
        {c.status === 'approved' && (c.spreadOrders > 1
          ? `It is used automatically over your next ${c.spreadOrders} orders, up to ${rupees(Math.ceil(c.refundAmount / c.spreadOrders))} per order.`
          : 'It is used automatically on your next order.')}
        {c.status === 'rejected' && (c.adminNote || 'Please call the shop if you have questions.')}
      </span>
      {c.status === 'approved' && c.adminNote && <span className="small">Shop's note: “{c.adminNote}”</span>}
      <span className="small muted">You reported: {c.items.map((i) => i.name).join(', ')} · “{c.text}”</span>
      {c.photos?.length > 0 && (
        <div className="photo-row">{c.photos.map((p) => <img key={p} src={assetUrl(p)} alt="Your photo" className="photo-thumb" />)}</div>
      )}
      {c.status === 'approved' && <Link to="/refer" className="small">See my wallet →</Link>}
    </section>
  );
}

function ReportForm({ order, onUpdate, windowDays }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState([]);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const addPhotos = (files) => {
    setPhotos((cur) => [...cur, ...Array.from(files)].slice(0, MAX_PHOTOS));
    setError('');
  };

  async function send(e) {
    e.preventDefault();
    if (!picked.length) return setError('Tick the items that were not good');
    if (!photos.length) return setError('Add at least one photo so the shop can see the problem');
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('text', text);
      form.append('items', picked.join(','));
      for (const f of photos) form.append('photos', await shrinkImage(f, 1400));
      onUpdate(await api(`/orders/${order.id}/complaints`, { method: 'POST', form }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <section className="card stack-sm">
        <strong>Got everything fresh?</strong>
        <div className="row gap wrap">
          <span className="muted small grow">
            If an item was spoiled, damaged or missing, send a photo{windowDays ? ` within ${windowDays} days` : ''}. If the shop approves it, the money goes back to your wallet.
          </span>
          <button className="btn btn-outline" onClick={() => setOpen(true)}>Report a problem</button>
        </div>
      </section>
    );
  }

  return (
    <form className="card stack-sm" onSubmit={send}>
      <strong>Report a problem</strong>
      <fieldset className="stack-xs plain-fieldset">
        <legend className="small strong">Which items were not good?</legend>
        {order.items.map((i) => (
          <label key={i.id} className="check-row">
            <input type="checkbox" checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />
            <span className="row-between grow"><span>{i.name} · {i.qtyLabel}{i.comboName ? ` (${i.comboName})` : ''}</span><span className="muted">{rupees(i.lineTotal)}</span></span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>What was wrong?</span>
        <textarea className="input textarea" required maxLength={500} rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. 3 tomatoes were rotten inside" />
      </label>
      <div className="stack-xs">
        <span className="small strong">Photos ({photos.length}/{MAX_PHOTOS}) · required</span>
        <div className="photo-row">
          {previews.map((u, idx) => (
            <span key={u} className="photo-wrap">
              <img src={u} alt={`Photo ${idx + 1}`} className="photo-thumb" />
              <button type="button" className="photo-remove" aria-label={`Remove photo ${idx + 1}`} onClick={() => setPhotos(photos.filter((_, j) => j !== idx))}>×</button>
            </span>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="photo-add">
              <span>+ Add photo</span>
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send to shop'}</button>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
