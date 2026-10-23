import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtQty, qtyOptions, rupees } from '../format';
import { ErrorNote, Spinner, Toggle } from '../components/ui';
import { useShop } from '../state';

const blank = { name: '', description: '', price: '', active: true, tint: '#FBEBC0', items: [] };

export default function AdminCombos() {
  const { reloadProducts } = useShop();
  const [combos, setCombos] = useState(null);
  const [products, setProducts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api('/admin/combos').then(setCombos).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/admin/products').then(setProducts).catch((e) => setError(e.message));
  }, []);

  async function remove(c) {
    if (!window.confirm(`Delete the combo "${c.name}"? Past orders keep their details.`)) return;
    try {
      await api(`/admin/combos/${c.id}`, { method: 'DELETE' });
      load();
      reloadProducts();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack page-narrow-desktop">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Combo packs</h1>
          <span className="muted">Bundles of everyday vegetables at one lower price. The saving is shown to customers.</span>
        </div>
        {!editing && <button className="btn btn-primary" onClick={() => setEditing({ ...blank })}>+ New combo</button>}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {editing && (
        <ComboForm combo={editing} products={products}
          onDone={(changed) => { setEditing(null); if (changed) { load(); reloadProducts(); } }} />
      )}

      {combos === null ? <Spinner /> : combos.length === 0 && !editing ? (
        <div className="card stack-sm">
          <strong>No combos yet</strong>
          <span className="muted small">Try a “Daily Sabzi Combo”: 1 kg aloo + 1 kg pyaz + 500 g tamatar, priced a little under the separate total.</span>
        </div>
      ) : combos.map((c) => (
        <div key={c.id} className={`card stack-sm ${c.active ? '' : 'is-off'}`}>
          <div className="row-between wrap">
            <span className="stack-xs">
              <strong>{c.name}{c.active ? '' : ' · hidden'}</strong>
              <span className="muted small">{c.items.map((i) => `${i.name} ${i.qtyLabel}`).join(' + ')}</span>
            </span>
            <span className="stack-xs align-end">
              <strong className="big">{rupees(c.price)}</strong>
              <span className="small">
                <span className="strike muted">{rupees(c.regularPrice)}</span>{' '}
                {c.savings > 0 ? <span className="text-green strong">save {rupees(c.savings)}</span> : <span className="text-red strong">no saving</span>}
              </span>
            </span>
          </div>
          {!c.available && c.active && <span className="small text-red strong">Not enough stock of one of its vegetables, so customers see “Sold out”.</span>}
          <div className="row gap">
            <button className="btn btn-sm btn-outline" onClick={() => setEditing({ ...c, items: c.items.map((i) => ({ productId: i.productId, qty: i.qty })) })}>Edit</button>
            <button className="link-btn danger small" onClick={() => remove(c)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComboForm({ combo, products, onDone }) {
  const [f, setF] = useState({ ...combo, price: String(combo.price ?? '') });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setF({ ...f, [k]: v });
  const byId = (id) => products.find((p) => p.id === Number(id));

  const regular = f.items.reduce((s, i) => {
    const p = byId(i.productId);
    return s + (p ? Math.round(Number(i.qty) * p.price) : 0);
  }, 0);
  const saving = regular - Number(f.price || 0);

  const setItem = (idx, patch) => set('items', f.items.map((it, j) => (j === idx ? { ...it, ...patch } : it)));
  function addItem() {
    const p = products.find((x) => !f.items.some((i) => i.productId === x.id));
    if (p) set('items', [...f.items, { productId: p.id, qty: qtyOptions(p)[Math.min(2, qtyOptions(p).length - 1)] }]);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...f, price: Number(f.price), items: f.items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty) })) };
    try {
      if (f.id) await api(`/admin/combos/${f.id}`, { method: 'PUT', body });
      else await api('/admin/combos', { method: 'POST', body });
      onDone(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="card stack-sm" onSubmit={submit}>
      <strong>{f.id ? `Edit ${combo.name}` : 'New combo pack'}</strong>
      <div className="form-grid">
        <label className="field span-2"><span>Name</span><input className="input" required maxLength={60} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Daily Sabzi Combo" /></label>
        <label className="field span-2"><span>Short description (optional)</span><input className="input" maxLength={160} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Everything for 2 days of cooking" /></label>
      </div>

      <span className="section-label">Vegetables in the pack</span>
      {f.items.map((it, idx) => {
        const p = byId(it.productId);
        const options = p ? qtyOptions(p) : [];
        if (p && !options.some((o) => Math.abs(o - Number(it.qty)) < 1e-9)) options.push(Number(it.qty));
        return (
          <div key={idx} className="row gap wrap combo-row">
            <select className="input grow" aria-label="Vegetable" value={it.productId}
              onChange={(e) => { const np = byId(e.target.value); setItem(idx, { productId: Number(e.target.value), qty: qtyOptions(np)[0] }); }}>
              {products.map((x) => (
                <option key={x.id} value={x.id} disabled={x.id !== it.productId && f.items.some((i) => i.productId === x.id)}>{x.name}</option>
              ))}
            </select>
            <select className="input input-auto" aria-label="Quantity" value={it.qty} onChange={(e) => setItem(idx, { qty: Number(e.target.value) })}>
              {options.sort((a, b) => a - b).map((o) => <option key={o} value={o}>{fmtQty(o, p.unit)}</option>)}
            </select>
            <span className="muted small combo-row-price">{p ? rupees(Math.round(Number(it.qty) * p.price)) : ''}</span>
            <button type="button" className="link-btn danger small" onClick={() => set('items', f.items.filter((_, j) => j !== idx))}>Remove</button>
          </div>
        );
      })}
      <button type="button" className="link-btn" onClick={addItem}>+ Add a vegetable</button>

      <div className="form-grid">
        <label className="field"><span>Combo price</span>
          <span className="money-input"><span>₹</span><input required inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} /></span>
        </label>
        <div className="field"><span>Bought separately</span><strong className="big">{rupees(regular)}</strong></div>
        <div className="field"><span>Customer saves</span><strong className={`big ${saving > 0 ? 'text-green' : 'text-red'}`}>{rupees(Math.max(0, saving))}</strong></div>
        <label className="field"><span>Card colour</span><input className="input input-color" type="color" value={f.tint} onChange={(e) => set('tint', e.target.value)} /></label>
      </div>
      {saving <= 0 && f.items.length > 0 && f.price !== '' && <span className="small text-red strong">Set the combo price below {rupees(regular)} so customers save.</span>}
      <ErrorNote>{error}</ErrorNote>
      <div className="row gap wrap">
        <Toggle on={f.active} onChange={(v) => set('active', v)} label="Show combo to customers" onText="Shown" offText="Hidden" />
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : f.id ? 'Save combo' : 'Create combo'}</button>
        <button type="button" className="btn btn-outline" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}
