// Category tiles from the design. Categories the shop adds later show up after these.
export const CATEGORY_INFO = {
  Leafy: { label: 'Leafy greens', hint: 'Palak, methi, dhaniya', tint: '#DCEBD8' },
  Roots: { label: 'Roots', hint: 'Aloo, pyaz, gajar', tint: '#F1E3CC' },
  Everyday: { label: 'Everyday', hint: 'Tamatar, bhindi, lauki', tint: '#F7DCD5' },
  Fruits: { label: 'Fruits', hint: 'Banana, papaya', tint: '#FBEBC0' },
  Exotic: { label: 'Exotic', hint: 'Broccoli, zucchini', tint: '#E4EED5' },
};

export function categoriesOf(products) {
  const known = Object.keys(CATEGORY_INFO);
  const present = [...new Set(products.map((p) => p.category))];
  return [...known.filter((c) => present.includes(c)), ...present.filter((c) => !known.includes(c)).sort()].map((key) => ({
    key,
    label: CATEGORY_INFO[key]?.label || key,
    hint: CATEGORY_INFO[key]?.hint || '',
    tint: CATEGORY_INFO[key]?.tint || '#E4EED5',
  }));
}

// Local names are in Hindi; these let "lauki" or "pyaz" typed in English letters still find them.
const LOCAL_IN_ENGLISH = {
  'टमाटर': 'tamatar', 'प्याज़': 'pyaz', 'आलू': 'aloo', 'पालक': 'palak', 'भिंडी': 'bhindi', 'धनिया': 'dhaniya',
  'मेथी': 'methi', 'गाजर': 'gajar', 'लौकी': 'lauki', 'गोभी': 'gobhi', 'हरी मिर्च': 'hari mirch', 'अदरक': 'adrak',
  'केला': 'kela', 'पपीता': 'papita', 'ब्रोकली': 'broccoli', 'ज़ुकीनी': 'zucchini',
};

export function matches(p, q) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  const local = p.localName || '';
  return [p.name, local, LOCAL_IN_ENGLISH[local] || ''].some((text) => text.toLowerCase().includes(s));
}
