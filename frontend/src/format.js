export const rupees = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

const trim = (n) => +Number(n).toFixed(3);

export function fmtQty(qty, unit) {
  qty = trim(qty);
  if (unit === 'kg') return qty < 1 ? `${Math.round(qty * 1000)} g` : `${qty} kg`;
  if (unit === 'bunch') return `${qty} ${qty === 1 ? 'bunch' : 'bunches'}`;
  return `${qty} ${qty === 1 ? 'piece' : 'pieces'}`;
}

export const unitLabel = (unit) => (unit === 'kg' ? '/ kg' : unit === 'bunch' ? '/ bunch' : '/ piece');

const isMultiple = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;

/** Quantities offered in the "Add" picker for a product. */
export function qtyOptions(p) {
  if (p.unit === 'kg') {
    const nice = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5];
    const opts = nice.filter((v) => v >= p.step - 1e-9 && isMultiple(v, p.step));
    return opts.length ? opts : [p.step];
  }
  return Array.from({ length: 10 }, (_, i) => trim((i + 1) * p.step));
}

export const STATUS_LABEL = {
  new: 'New',
  confirmed: 'Confirmed',
  packed: 'Packed',
  out: 'Out for delivery',
  delivered: 'Delivered',
  not_available: 'Not available',
  cancelled: 'Cancelled',
};

export const STATUS_CHIP = {
  new: 'chip-yellow',
  confirmed: 'chip-blue',
  packed: 'chip-green',
  out: 'chip-purple',
  delivered: 'chip-green',
  not_available: 'chip-red',
  cancelled: 'chip-grey',
};

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const localDate = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
