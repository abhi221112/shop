import { useEffect, useState } from 'react';
import { api } from '../api';
import { fmtQty, rupees } from '../format';
import { ErrorNote, Spinner } from '../components/ui';

const RANGES = [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']];

const dayLabel = (iso, opts = { day: 'numeric', month: 'short' }) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', opts);

export default function AdminReports() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api(`/admin/reports?days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [days]);

  const t = data?.totals;
  return (
    <div className="stack">
      <div className="admin-head">
        <div className="stack-xs">
          <h1 className="page-title">Reports</h1>
          <span className="muted">{data ? `${dayLabel(data.start)} – ${dayLabel(data.end)} · by delivery date, cancelled orders excluded` : ' '}</span>
        </div>
        <div role="tablist" aria-label="Date range" className="row gap wrap">
          {RANGES.map(([d, label]) => (
            <button key={d} role="tab" aria-selected={days === d} className={`chip chip-dark ${days === d ? 'is-on' : ''}`} onClick={() => setDays(d)}>{label}</button>
          ))}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {!data ? <Spinner /> : (
        <>
          <div className="stat-grid">
            <Stat label="Sales" value={rupees(t.sales)} note={`UPI ${rupees(t.upi)} · Cash ${rupees(t.cash)}`} />
            <Stat label="Orders" value={t.orders} note={`${t.cancelled} cancelled`} />
            <Stat label="Average order" value={rupees(t.avgOrder)} note="Sales ÷ orders" />
            <Stat label="Customers" value={t.customers} note={`${t.newCustomers} new sign-ups`} />
          </div>

          <SalesChart daily={data.daily} />

          <div className="report-grid">
            <section className="card stack-sm">
              <h2 className="card-title">Top vegetables by sales</h2>
              {data.topProducts.length === 0 ? <p className="muted small">No sales in this period.</p> : (
                <table className="table table-plain">
                  <thead><tr><th>Vegetable</th><th>Sold</th><th className="num">Sales</th></tr></thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.name + p.unit}><td>{p.name}</td><td className="muted">{fmtQty(p.qty, p.unit)}</td><td className="num"><strong>{rupees(p.revenue)}</strong></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card stack-sm">
              <h2 className="card-title">Orders by delivery slot</h2>
              <table className="table table-plain">
                <thead><tr><th>Slot</th><th className="num">Orders</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {data.slots.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="num"><strong>{s.orders}</strong></td>
                      <td className="num muted">{t.orders ? Math.round((s.orders / t.orders) * 100) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

const Stat = ({ label, value, note }) => (
  <div className="card stat">
    <span className="muted small">{label}</span>
    <strong className="stat-value">{value}</strong>
    <span className="muted small">{note}</span>
  </div>
);

/** Round the axis maximum up to a 1/2/5 × 10ⁿ step so gridlines land on readable numbers. */
function niceScale(max, ticks = 4) {
  if (max <= 0) return { top: 100, step: 25 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { top: step * Math.ceil(max / step), step };
}

const compact = (n) => (n >= 1000 ? `₹${+(n / 1000).toFixed(1)}k` : `₹${n}`);

function SalesChart({ daily }) {
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(...daily.map((d) => d.sales));
  const { top, step } = niceScale(max);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Label roughly 7 dates along the axis so they never collide.
  const every = Math.ceil(daily.length / 7);

  return (
    <section className="card stack-sm">
      <div className="row-between wrap">
        <h2 className="card-title">Daily sales</h2>
        <button className="link-btn small" onClick={() => setShowTable(!showTable)}>{showTable ? 'Show chart' : 'Show as table'}</button>
      </div>
      {showTable ? (
        <div className="table-box table-box-flat">
          <table className="table table-plain">
            <thead><tr><th>Date</th><th className="num">Orders</th><th className="num">UPI</th><th className="num">Cash</th><th className="num">Sales</th></tr></thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}><td>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td><td className="num">{d.orders}</td>
                  <td className="num">{rupees(d.upi)}</td><td className="num">{rupees(d.cash)}</td><td className="num"><strong>{rupees(d.sales)}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bar-chart" role="img" aria-label={`Daily sales bar chart, highest ${rupees(max)}. Use "Show as table" for exact values.`}>
          <div className="bar-chart-y" aria-hidden="true">
            {[...ticks].reverse().map((v) => <span key={v}>{compact(v)}</span>)}
          </div>
          <div className="bar-chart-plot">
            {ticks.map((v) => <span key={v} className="bar-grid" style={{ bottom: `${(v / top) * 100}%` }} aria-hidden="true" />)}
            <div className="bar-chart-bars">
              {daily.map((d, i) => (
                <div key={d.date} className="bar-col" tabIndex={0} aria-label={`${dayLabel(d.date)}: ${rupees(d.sales)}, ${d.orders} orders`}>
                  {d.sales > 0 && <span className="bar" style={{ height: `${(d.sales / top) * 100}%` }} />}
                  <span className={`bar-tip ${i > daily.length * 0.66 ? 'tip-left' : ''}`} role="tooltip">
                    <strong>{dayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</strong>
                    <span>{rupees(d.sales)} · {d.orders} orders</span>
                    <span className="muted">UPI {rupees(d.upi)} · Cash {rupees(d.cash)}</span>
                  </span>
                  {i % every === 0 && <span className="bar-x" aria-hidden="true">{dayLabel(d.date)}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
