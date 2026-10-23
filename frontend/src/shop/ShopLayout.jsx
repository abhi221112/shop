import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { isNativeApp } from '../api';
import { CartIcon, GridIcon, HomeIcon, ListIcon, SearchIcon, UserIcon } from '../components/Icons';
import { useAuth, useCart, useShop } from '../state';

const NAV_PAGES = ['/', '/categories', '/orders', '/account'];

export default function ShopLayout() {
  const { pathname } = useLocation();
  const showBottomNav = NAV_PAGES.includes(pathname);
  return (
    <div className={`shop ${showBottomNav ? 'has-bottom-nav' : ''}`}>
      <DesktopHeader />
      <main className="shop-main">
        <Outlet />
      </main>
      <Footer />
      {showBottomNav && <BottomNav />}
    </div>
  );
}

function DesktopHeader() {
  const { config } = useShop();
  const { user } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const onSearch = (e) => {
    const q = e.target.value;
    navigate(q ? `/?q=${encodeURIComponent(q)}` : '/', { replace: true });
  };

  return (
    <header className="site-header desktop-only">
      <div className="container site-header-row">
        <Link to="/" className="brand">{config.shopName}</Link>
        <label className="search search-light">
          <SearchIcon size={18} />
          <input aria-label="Search vegetables" placeholder="Search tomato, palak, bhindi…" value={params.get('q') || ''} onChange={onSearch} />
        </label>
        <nav aria-label="Account" className="site-header-nav">
          {user?.role === 'admin' && <Link to="/admin" className="nav-link">Admin</Link>}
          {user?.role === 'delivery' && <Link to="/delivery" className="nav-link">Deliveries</Link>}
          <Link to="/orders" className="nav-link">My orders</Link>
          {user ? <Link to="/account" className="nav-link">{user.name || 'Account'}</Link> : <Link to="/login" className="nav-link">Login</Link>}
          <Link to="/cart" className="btn btn-dark"><CartIcon size={18} />Cart · {count}</Link>
        </nav>
      </div>
    </header>
  );
}

function BottomNav() {
  const item = (to, Icon, label) => (
    <NavLink to={to} end className={({ isActive }) => `bottom-nav-item ${isActive ? 'is-active' : ''}`}>
      <Icon />{label}
    </NavLink>
  );
  return (
    <nav aria-label="Main" className="bottom-nav mobile-only">
      {item('/', HomeIcon, 'Home')}
      {item('/categories', GridIcon, 'Categories')}
      {item('/orders', ListIcon, 'Orders')}
      {item('/account', UserIcon, 'Account')}
    </nav>
  );
}

function Footer() {
  const { config } = useShop();
  return (
    <footer className="site-footer desktop-only">
      <div className="container site-footer-row">
        <div className="stack-sm">
          <strong>{config.shopName}</strong>
          <span>{[config.shopAddress, config.shopPhone].filter(Boolean).join(' · ') || 'Fresh vegetables, delivered daily'}</span>
        </div>
        {!isNativeApp() && <span>Order daily? Add this site to your home screen, or install our Android app.</span>}
      </div>
    </footer>
  );
}
