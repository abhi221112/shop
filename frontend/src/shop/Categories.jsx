import { Link } from 'react-router-dom';
import { useShop } from '../state';
import { categoriesOf } from './catalog';

export default function Categories() {
  const { products } = useShop();
  const categories = categoriesOf(products);
  return (
    <div className="container page">
      <h1 className="page-title">Categories</h1>
      <div className="category-grid">
        {categories.map((c) => (
          <Link key={c.key} to={`/?cat=${encodeURIComponent(c.key)}`} className="category-tile" style={{ background: c.tint }}>
            <strong>{c.label}</strong>
            <span>{c.hint || `${products.filter((p) => p.category === c.key).length} items`}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
