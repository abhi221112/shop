import { useEffect, useState } from 'react';
import { api } from '../api';
import { rupees } from '../format';
import { ErrorNote, Toggle } from '../components/ui';

// Slot times are hours as numbers on the API (5.5 = 5:30 AM, 24 = midnight) and "HH:MM" in time pickers.
const toTime = (h) => {
  const total = Math.round(Number(h) * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
const fromTime = (t, isEnd = false) => {
  const [hh, mm] = String(t || '0:0').split(':').map(Number);
  const h = hh + mm / 60;
  return isEnd && h === 0 ? 24 : h; // an end time of 00:00 means midnight
};
const clock = (h) => {
  const total = Math.round(Number(h) * 60) % (24 * 60);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'AM' : 'PM'}`;
};
const rangeName = (a, b) => {
  let x = clock(a);
  const y = clock(b);
  if (x.slice(-2) === y.slice(-2) && Number(b) < 24) x = x.slice(0, -3);
  return `${x} – ${y}`;
};

const autoName = (s) => (s.bookUntil === 'end' ? `Anytime · ${rangeName(s.startHour, s.endHour)}` : rangeName(s.startHour, s.endHour));

/** A time picker with the time spelled out underneath, so 09:00 vs 21:00 is never ambiguous. */
function TimeField({ label, value, isEnd, onChange }) {
  return (
    <label className="field"><span>{label}</span>
      <input className="input" type="time" step={900} value={toTime(value)} onChange={(e) => onChange(fromTime(e.target.value, isEnd))} />
      <span className="time-hint">{clock(value)}{isEnd && Number(value) === 24 ? ' (midnight)' : ''}</span>
    </label>
  );
}

const blankScheduled = { label: '', kind: 'scheduled', startHour: 17, endHour: 19, capacity: 20, fee: 0, minutes: null, active: true, auto: true, bookUntil: 'start' };
const blankExpress = { label: 'Express · in 30 min', kind: 'express', startHour: 8, endHour: 20, capacity: 30, fee: 30, minutes: 30, active: true };

export default function AdminSlots() {
  const [slots, setSlots] = useState([]);
  const [win, setWin] = useState({ from: 5, until: 24, cutoffHours: 2 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => api('/admin/slots').then((list) => setSlots(list.map((s) => ({ ...s, auto: s.label === autoName(s) }))))
    .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/admin/slots/window').then(setWin).catch(() => {});
  }, []);

  function update(i, key, value) {
    setSlots(slots.map((s, j) => {
      if (j !== i) return s;
      const next = { ...s, [key]: value };
      if (key === 'label') next.auto = false;
      // Keep the customer-facing name in step with the times unless it was typed by hand.
      if (['startHour', 'endHour', 'bookUntil'].includes(key) && s.kind !== 'express' && (s.auto || !s.label)) {
        next.label = autoName(next);
        next.auto = true;
      }
      return next;
    }));
  }

  async function save(i) {
    setError('');
    setNotice('');
    const s = slots[i];
    const body = { ...s, capacity: Number(s.capacity), fee: Number(s.fee || 0), minutes: s.kind === 'express' ? Number(s.minutes) : null };
    try {
      const saved = s.id ? await api(`/admin/slots/${s.id}`, { method: 'PUT', body }) : await api('/admin/slots', { method: 'POST', body });
      await load();
      setNotice(`Saved ${saved.label}`);
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(i) {
    const s = slots[i];
    if (!s.id) return setSlots(slots.filter((_, j) => j !== i));
    if (!window.confirm(`Delete the slot "${s.label}"?`)) return;
    setError('');
    try {
      await api(`/admin/slots/${s.id}`, { method: 'DELETE' });
      await load();
      setNotice(`Deleted ${s.label}`);
    } catch (e) {
      setError(e.message);
    }
  }

  const hasExpress = slots.some((s) => s.kind === 'express');
  const scheduledCount = slots.filter((s) => s.kind !== 'express').length;

  return (
    <div className="stack page-narrow-desktop">
      <div className="stack-xs">
        <h1 className="page-title">Delivery slots</h1>
        <span className="muted">
          Slots can be any time from {clock(win.from)} to {clock(win.until)}{win.until === 24 ? ' (midnight)' : ''}, in 15-minute steps.
          Customers must order {win.cutoffHours} hours before a scheduled slot starts. Capacity is the most orders per slot per day.
        </span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {notice && <p className="ok-note" role="status">{notice}</p>}

      <Generator win={win} onDone={(n) => { load(); setNotice(`Added ${n} slots`); setError(''); }} onError={setError} />

      {slots.map((s, i) => {
        const express = s.kind === 'express';
        return (
          <div key={s.id || `new-${i}`} className={`card stack-sm ${express ? 'slot-card-express' : ''}`}>
            <div className="row-between wrap">
              <strong>{express ? 'Express delivery' : s.label || 'New slot'}{s.id ? '' : ' (not saved)'}</strong>
              {s.today && <SlotToday slot={s} />}
            </div>
            <div className="form-grid">
              <TimeField label={express ? 'Open from' : 'Starts'} value={s.startHour} onChange={(v) => update(i, 'startHour', v)} />
              <TimeField label={express ? 'Open until' : 'Ends'} value={s.endHour} isEnd onChange={(v) => update(i, 'endHour', v)} />
              <label className="field"><span>Capacity per day</span>
                <input className="input" type="number" min={0} value={s.capacity} onChange={(e) => update(i, 'capacity', e.target.value)} />
              </label>
              <label className="field"><span>Extra fee (₹)</span>
                <input className="input" type="number" min={0} value={s.fee ?? 0} onChange={(e) => update(i, 'fee', e.target.value)} />
              </label>
              {express && (
                <label className="field"><span>Deliver within (minutes)</span>
                  <input className="input" type="number" min={10} max={240} value={s.minutes ?? 30} onChange={(e) => update(i, 'minutes', e.target.value)} />
                </label>
              )}
              <label className="field span-2"><span>Name shown to customers</span>
                <input className="input" value={s.label} onChange={(e) => update(i, 'label', e.target.value)} placeholder={express ? 'Express · in 30 min' : autoName(s)} />
              </label>
            </div>
            {!express && (
              <label className="check-row">
                <input type="checkbox" checked={s.bookUntil === 'end'} onChange={(e) => update(i, 'bookUntil', e.target.checked ? 'end' : 'start')} />
                <span>
                  <strong>Anytime delivery</strong>: the delivery partner can come any time in this window.
                  {' '}Customers can order until {clock(Number(s.bookUntil === 'end' ? s.endHour : s.startHour) - win.cutoffHours)}
                  {s.bookUntil === 'end' ? ' (2 hours before it ends).' : ' (2 hours before it starts). Tick this for long windows like 5 AM – 9 PM.'}
                </span>
              </label>
            )}
            {express && (
              <span className="muted small">
                Customers can choose express from {clock(s.startHour)} to {clock(s.endHour)} (last order {s.minutes || 30} min before closing),
                for {rupees(s.fee || 0)} on top of the normal delivery fee.
              </span>
            )}
            <div className="row gap wrap">
              <Toggle on={s.active} onChange={(v) => update(i, 'active', v)} label={`Slot ${s.label} open`} onText="Open" offText="Closed" />
              <button className="btn btn-primary" onClick={() => save(i)}>{s.id ? 'Save' : 'Add slot'}</button>
              <button className="link-btn danger" onClick={() => remove(i)}>{s.id ? 'Delete' : 'Discard'}</button>
            </div>
          </div>
        );
      })}

      {scheduledCount === 0 && <p className="muted">No scheduled slots yet. Use “Create many slots” above, or add one.</p>}
      <div className="row gap wrap">
        <button className="link-btn" onClick={() => setSlots([...slots, { ...blankScheduled, label: rangeName(17, 19) }])}>+ Add a slot</button>
        {!hasExpress && <button className="link-btn" onClick={() => setSlots([...slots, { ...blankExpress }])}>+ Add express delivery (30 min)</button>}
      </div>
    </div>
  );
}

function Generator({ win, onDone, onError }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: '05:00', until: '00:00', every: '2', capacity: '20', fee: '0' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const start = fromTime(f.from);
  const end = fromTime(f.until, true);
  const whole = f.every === 'whole';
  const every = whole ? end - start : Number(f.every);
  const preview = [];
  for (let t = start; every > 0 && t + every <= end + 1e-9 && preview.length < 40; t += every) {
    preview.push(whole ? `Anytime · ${rangeName(t, t + every)}` : rangeName(t, t + every));
  }

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const made = await api('/admin/slots/generate', {
        method: 'POST',
        body: { from: start, until: end, every, anytime: whole, capacity: Number(f.capacity), fee: Number(f.fee || 0) },
      });
      setOpen(false);
      onDone(made.length);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button className="btn btn-outline" onClick={() => { setF({ ...f, from: toTime(win.from), until: toTime(win.until) }); setOpen(true); }}>Create many slots at once</button>;
  }
  return (
    <form className="card stack-sm" onSubmit={create}>
      <strong>Create many slots at once</strong>
      <div className="form-grid">
        <TimeField label="From" value={start} onChange={(v) => setF({ ...f, from: toTime(v) })} />
        <TimeField label="Until" value={end} isEnd onChange={(v) => setF({ ...f, until: toTime(v) })} />
        <label className="field"><span>Each slot is</span>
          <select className="input" value={f.every} onChange={set('every')}>
            {[['whole', 'One slot for the whole time (anytime delivery)'], ['0.5', '30 minutes'], ['1', '1 hour'], ['1.5', '1½ hours'], ['2', '2 hours'], ['3', '3 hours'], ['4', '4 hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="field"><span>Capacity each</span><input className="input" type="number" min={0} value={f.capacity} onChange={set('capacity')} /></label>
        <label className="field"><span>Extra fee each (₹)</span><input className="input" type="number" min={0} value={f.fee} onChange={set('fee')} /></label>
      </div>
      <span className="small muted">
        {preview.length ? `${preview.length} ${preview.length === 1 ? 'slot' : 'slots'}: ${preview.join(', ')}.` : 'Choose a "From" earlier than "Until".'}
        {whole && preview.length ? ` Customers can order until ${clock(end - win.cutoffHours)}, and the delivery partner can deliver any time in between.` : ''}
        {' '}Slots that already exist are skipped.
      </span>
      <div className="row gap">
        <button className="btn btn-primary" disabled={busy || !preview.length}>{busy ? 'Creating…' : `Create ${preview.length} ${preview.length === 1 ? 'slot' : 'slots'}`}</button>
        <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function SlotToday({ slot: s }) {
  const t = s.today;
  let state;
  if (!s.active) state = <span className="chip-status chip-grey">Closed</span>;
  else if (t.booked >= s.capacity) state = <span className="chip-status chip-red">Full today</span>;
  else if (t.open) state = <span className="chip-status chip-green">Open now · orders until {t.orderBy}</span>;
  else if (s.kind === 'express') state = <span className="chip-status chip-yellow">Not taking orders now · opens {t.opensAt}</span>;
  else state = <span className="chip-status chip-yellow">Closed for today (cutoff {t.orderBy})</span>;
  return (
    <span className="row gap-sm wrap">
      <span className="small"><strong>Today {t.booked}/{s.capacity}</strong></span>
      {s.kind !== 'express' && <span className="small muted">Tomorrow {s.tomorrow.booked}/{s.capacity}</span>}
      {state}
    </span>
  );
}
