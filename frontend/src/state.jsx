import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, storage } from './api';

// Remember a friend's referral code from a shared link (?ref=CODE) until the visitor signs up.
try {
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) storage.set('ref', ref.trim().slice(0, 20));
} catch { /* ignore */ }

// ---------- Login ----------

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => {
    try { return JSON.parse(storage.get('user')) || null; } catch { return null; }
  });

  const setUser = useCallback((u) => {
    setUserState(u);
    storage.set('user', u ? JSON.stringify(u) : null);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, [setUser]);

  const login = useCallback((token, u) => {
    setToken(token);
    setUser(u);
  }, [setUser]);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    if (storage.get('token')) api('/auth/me').then(setUser).catch(() => {});
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [setUser]);

  const value = useMemo(() => ({ user, login, logout, setUser }), [user, login, logout, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------- Cart: loose items { [productId]: qty } + combo packs { [comboId]: count } ----------

const CartContext = createContext(null);

const readJson = (key) => {
  try { return JSON.parse(storage.get(key)) || {}; } catch { return {}; }
};

export function CartProvider({ children }) {
  const [lines, setLines] = useState(() => readJson('cart'));
  const [combos, setCombos] = useState(() => readJson('cartCombos'));

  useEffect(() => storage.set('cart', JSON.stringify(lines)), [lines]);
  useEffect(() => storage.set('cartCombos', JSON.stringify(combos)), [combos]);

  const setQty = useCallback((id, qty) => {
    setLines((prev) => {
      const next = { ...prev };
      if (qty > 0) next[id] = +qty.toFixed(3);
      else delete next[id];
      return next;
    });
  }, []);
  const add = useCallback((id, qty) => setLines((prev) => ({ ...prev, [id]: +((prev[id] || 0) + qty).toFixed(3) })), []);

  const setComboCount = useCallback((id, n) => {
    setCombos((prev) => {
      const next = { ...prev };
      if (n > 0) next[id] = Math.min(20, n);
      else delete next[id];
      return next;
    });
  }, []);
  const addCombo = useCallback((id, n = 1) => setCombos((prev) => ({ ...prev, [id]: Math.min(20, (prev[id] || 0) + n) })), []);

  const clear = useCallback(() => { setLines({}); setCombos({}); }, []);

  const value = useMemo(() => ({
    lines, combos, setQty, add, setComboCount, addCombo, clear,
    count: Object.keys(lines).length + Object.values(combos).reduce((s, n) => s + n, 0),
    payload: {
      items: Object.entries(lines).map(([id, qty]) => ({ productId: Number(id), qty })),
      combos: Object.entries(combos).map(([id, count]) => ({ comboId: Number(id), count })),
    },
  }), [lines, combos, setQty, add, setComboCount, addCombo, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);

// ---------- Shop data ----------

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [config, setConfig] = useState({ shopName: 'Fresh Vegetables', deliveryFee: 20, freeDeliveryMin: null, paymentMode: 'mock', offers: null });
  const [catalog, setCatalog] = useState({ products: [], updatedAt: null, loading: true, error: null });
  const [comboList, setComboList] = useState([]);
  const [slots, setSlots] = useState([]);

  const reloadProducts = useCallback(() => {
    api('/combos').then(setComboList).catch(() => {});
    return api('/products')
      .then((d) => setCatalog({ products: d.products, updatedAt: d.updatedAt, loading: false, error: null }))
      .catch((e) => setCatalog((c) => ({ ...c, loading: false, error: e.message })));
  }, []);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
    api('/slots').then(setSlots).catch(() => {});
    reloadProducts();
  }, [reloadProducts]);

  useEffect(() => {
    document.title = `${config.shopName} · Fresh vegetables delivered`;
  }, [config.shopName]);

  const value = useMemo(() => ({ config, offers: config.offers, ...catalog, combos: comboList, slots, reloadProducts }),
    [config, catalog, comboList, slots, reloadProducts]);
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);

/** Quick local cart total for the floating cart bar (the server quote is the real bill). */
export function useBill() {
  const { lines, combos } = useCart();
  const { products, combos: comboList } = useShop();
  return useMemo(() => {
    const items = Object.entries(lines)
      .map(([id, qty]) => {
        const product = products.find((p) => p.id === Number(id));
        return product ? { product, qty, lineTotal: Math.round(qty * product.price) } : null;
      })
      .filter(Boolean);
    const comboLines = Object.entries(combos)
      .map(([id, count]) => {
        const combo = comboList.find((c) => c.id === Number(id));
        return combo ? { combo, count, lineTotal: combo.price * count } : null;
      })
      .filter(Boolean);
    const goods = items.reduce((s, i) => s + i.lineTotal, 0) + comboLines.reduce((s, c) => s + c.lineTotal, 0);
    return { items, comboLines, goods };
  }, [lines, combos, products, comboList]);
}

/** Server-priced bill for the current cart (and slot), refreshed as the cart changes. */
export function useQuote(slot) {
  const { payload, count } = useCart();
  const [state, setState] = useState({ quote: null, error: '', loading: true });
  const key = JSON.stringify([payload, slot]);
  useEffect(() => {
    if (!count) return setState({ quote: null, error: '', loading: false });
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      api('/cart/quote', { method: 'POST', body: { ...payload, ...(slot || {}) } })
        .then((quote) => live && setState({ quote, error: '', loading: false }))
        .catch((e) => live && setState({ quote: null, error: e.message, loading: false }));
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Logged-in customer's first-order eligibility, wallet and referral code. */
export function usePerks() {
  const { user } = useAuth();
  const [perks, setPerks] = useState(null);
  useEffect(() => {
    if (!user) return setPerks(null);
    api('/me/perks').then(setPerks).catch(() => setPerks(null));
  }, [user]);
  return perks;
}
