// Website: same-origin "/api". Android/iOS app: the full API address from VITE_API_URL.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());

export const assetUrl = (url) => (url && url.startsWith('/') ? API_URL + url : url);

const storage = {
  get: (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set: (k, v) => {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ }
  },
};
export { storage };

let token = storage.get('token');

export function setToken(value) {
  token = value;
  storage.set('token', value);
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the shop right now. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
  return data;
}
