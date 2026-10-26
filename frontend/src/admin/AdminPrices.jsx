import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { fmtQty, rupees } from '../format';
import { ErrorNote, ProductImage, Spinner, Toggle } from '../components/ui';
import { useShop } from '../state';
import { shrinkImage } from './image';

const text = (n) => (n == null ? '' : String(n));
const toEdit = (p) => ({ price: String(p.price), stock: String(p.stock), active: p.active, bulkPrice: text(p.bulkPrice), bulkMin: text(p.bulkMin) });

export default function AdminPrices() {
  const { reloadProducts } = useShop();
  const [products, setProducts] = useState(null);
  const [edits, setEdits] = useState({});
  const [find, setFind] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(null);

  const reset = (list) => {
    setProducts(list);
    setEdits(Object.fromEntries(list.map((p) => [p.id, toEdit(p)])));
  };

  useEffect(() => {
    api('/admin/products').then(reset).catch((e) => setError(e.message));
  }, []);

  const changed = useMemo(() => (products || []).filter((p) => {
    const e = edits[p.id];
    return e && (Number(e.price) !== p.price || Number(e.stock) !== p.stock || e.active !== p.active
      || e.bulkPrice.trim() !== text(p.bulkPrice) || e.bulkMin.trim() !== text(p.bulkMin));
  }), [products, edits]);

  const set = (id, key, value) => setEdits((all) => ({ ...all, [id]: { ...all[id], [key]: value } }));

  function copyYesterday() {
    setEdits((all) => Object.fromEntries(Object.entries(all).map(([id, e]) => {
      const p = products.find((x) => x.id === Number(id));
      return [id, { ...e, price: String(p.yesterdayPrice ?? p.price) }];
    })));
  }

  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const rows = changed.map((p) => {
        const e = edits[p.id];
        return { id: p.id, price: Number(e.price), stock: Number(e.stock), active: e.active, bulkPrice: e.bulkPrice.trim(), bulkMin: e.bulkMin.trim() };
      });
      if (rows.some((r) => !(r.price >= 0) || !(r.stock >= 0))) throw new Error('Prices and stock must be numbers, zero or more');
      reset(await api('/admin/products/prices', { method: 'PUT', body: rows }));
      reloadProducts();
      setNotice('Saved. New prices are live on the app and website.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePhoto(p, { file, remove }) {
    setError('');
    setUploading(p.id);
    try {
      const form = new FormData();
      if (remove) form.append('removeImage', 'true');
      else form.append('image', await shrinkImage(file));
      const updated = await api(`/admin/products/${p.id}`, { method: 'PATCH', form });
      setProducts((list) => list.map((x) => (x.id === p.id ? updated : x)));
      reloadProducts();
    } catch (e) {
      setError(`${p.name}: ${e.message}`);
    } finally {
      setUploading(null);
    }
  }

  const shown = (products || []).filter((p) => !find || `${p.name} ${p.localName}`.toLowerCase().includes(find.toLowerCase()));

  return (
    <div className="stack">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Today's prices &amp; stock</h1>
          <span className="muted">Set this every morning after the mandi. Saved prices go live on the app and website. A bulk rate (e.g. ₹27 from 10 kg) shows the item under Bulk order; leave both boxes empty for no bulk rate.</span>
        </div>
        <div className="row gap wrap">
          <button className="btn btn-outline" onClick={copyYesterday} disabled={!products}>Copy yesterday's prices</button>
          <button className="btn btn-outline" onClick={() => setAdding(true)}>+ Add vegetable</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !changed.length}>{busy ? 'Saving…' : 'Save & publish'}</button>
        </div>
      </div>

      {adding && <AddProduct onDone={(p) => { setAdding(false); if (p) { reset([...products, p]); reloadProducts(); } }} />}

      <div className="row gap wrap">
        <input className="input input-search" aria-label="Find a vegetable" placeholder="Find a vegetable" value={find} onChange={(e) => setFind(e.target.value)} />
        <span className="muted small">{changed.length ? `${changed.length} changes · not saved yet` : 'No unsaved changes'}</span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="ok-note" role="status">{notice}</p>}

      {!products ? <Spinner /> : (
        <div className="table-box">
          <table className="table">
            <thead>
              <tr><th>Photo</th><th>Vegetable</th><th>Sold by</th><th>Yesterday</th><th>Today's price (₹)</th><th>Bulk rate (₹) · from</th><th>Stock left</th><th>Show to customers</th></tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const e = edits[p.id] || toEdit(p);
                const low = Number(e.stock) <= p.lowStockAt;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="photo-cell">
                        <ProductImage product={p} className="thumb-photo" />
                        <div className="stack-xs">
                          {uploading === p.id ? <span className="muted small">Uploading…</span> : (
                            <>
                              <label className="btn btn-sm btn-outline photo-btn">
                                {p.imageUrl ? 'Change' : 'Upload photo'}
                                <input type="file" accept="image/*" className="sr-only"
                                  onChange={(ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) changePhoto(p, { file: f }); }} />
                              </label>
                              {p.imageUrl && (
                                <button className="link-btn danger small" onClick={() => window.confirm(`Remove the photo of ${p.name}?`) && changePhoto(p, { remove: true })}>Remove</button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className="stack-xs"><strong>{p.name}</strong><span className="muted small">{p.localName}</span></span></td>
                    <td className="muted">{p.unit} ({fmtQty(p.step, p.unit)} steps)</td>
                    <td className="muted">{p.yesterdayPrice != null ? rupees(p.yesterdayPrice) : '—'}</td>
                    <td><input className="input input-num" inputMode="decimal" aria-label={`Today's price for ${p.name}`} value={e.price} onChange={(ev) => set(p.id, 'price', ev.target.value)} /></td>
                    <td>
                      <span className="row gap-sm">
                        <input className="input input-num input-num-sm" inputMode="decimal" placeholder="—" aria-label={`Bulk rate for ${p.name}`} value={e.bulkPrice} onChange={(ev) => set(p.id, 'bulkPrice', ev.target.value)} />
                        <span className="muted small">from</span>
                        <input className="input input-num input-num-sm" inputMode="decimal" placeholder="—" aria-label={`Bulk rate for ${p.name} starts from, in ${p.unit}`} value={e.bulkMin} onChange={(ev) => set(p.id, 'bulkMin', ev.target.value)} />
                        <span className="muted small">{p.unit}</span>
                      </span>
                    </td>
                    <td>
                      <span className="row gap-sm">
                        <input className="input input-num" inputMode="decimal" aria-label={`Stock of ${p.name} in ${p.unit}`} value={e.stock} onChange={(ev) => set(p.id, 'stock', ev.target.value)} />
                        <span className={low ? 'text-red small strong' : 'muted small'}>{p.unit}{low ? ' · low' : ''}</span>
                      </span>
                    </td>
                    <td><Toggle on={e.active} onChange={(v) => set(p.id, 'active', v)} label={`Show ${p.name} to customers`} onText="In stock" offText="Hidden" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddProduct({ onDone }) {
  const [f, setF] = useState({ name: '', localName: '', category: 'Everyday', unit: 'kg', step: '0.25', price: '', stock: '', lowStockAt: '5', tint: '#E4EED5', bulkPrice: '', bulkMin: '' });
  const [image, setImage] = useState(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    try {
      if (image) form.append('image', await shrinkImage(image));
      onDone(await api('/admin/products', { method: 'POST', form }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit}>
      <h2 className="card-title span-all">Add a vegetable</h2>
      <label className="field"><span>Name</span><input className="input" required value={f.name} onChange={set('name')} placeholder="Tomato" /></label>
      <label className="field"><span>Local name</span><input className="input" value={f.localName} onChange={set('localName')} placeholder="टमाटर" /></label>
      <label className="field"><span>Category</span>
        <input className="input" list="categories" value={f.category} onChange={set('category')} />
        <datalist id="categories">{['Leafy', 'Roots', 'Everyday', 'Fruits', 'Exotic'].map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="field"><span>Sold by</span>
        <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value, step: e.target.value === 'kg' ? '0.25' : '1' })}>
          <option value="kg">kg</option><option value="bunch">bunch</option><option value="piece">piece</option>
        </select>
      </label>
      <label className="field"><span>Smallest quantity ({f.unit})</span><input className="input" required inputMode="decimal" value={f.step} onChange={set('step')} /></label>
      <label className="field"><span>Price per {f.unit} (₹)</span><input className="input" required inputMode="decimal" value={f.price} onChange={set('price')} /></label>
      <label className="field"><span>Stock ({f.unit})</span><input className="input" required inputMode="decimal" value={f.stock} onChange={set('stock')} /></label>
      <label className="field"><span>Bulk rate per {f.unit} (₹, optional)</span><input className="input" inputMode="decimal" value={f.bulkPrice} onChange={set('bulkPrice')} placeholder="e.g. 27" /></label>
      <label className="field"><span>Bulk rate from ({f.unit})</span><input className="input" inputMode="decimal" value={f.bulkMin} onChange={set('bulkMin')} placeholder="e.g. 10" /></label>
      <label className="field"><span>Warn when stock below</span><input className="input" inputMode="decimal" value={f.lowStockAt} onChange={set('lowStockAt')} /></label>
      <label className="field"><span>Photo (optional)</span>
        <span className="row gap-sm">
          {preview && <img src={preview} alt="" className="thumb-photo" />}
          <input className="input" type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0] || null)} />
        </span>
      </label>
      <label className="field"><span>Placeholder colour</span><input className="input input-color" type="color" value={f.tint} onChange={set('tint')} /></label>
      <div className="span-all stack-sm">
        <ErrorNote>{error}</ErrorNote>
        <div className="row gap">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add vegetable'}</button>
          <button type="button" className="btn btn-outline" onClick={() => onDone(null)}>Cancel</button>
        </div>
      </div>
    </form>
  );
}
