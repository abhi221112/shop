import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { isNativeApp } from '../api';
import { CartIcon, ClockIcon, GridIcon, HomeIcon, ListIcon, PhoneIcon, PinIcon, SearchIcon, TruckIcon, UserIcon } from '../components/Icons';
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
      <Footer onMobile={showBottomNav} />
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
        <Link to="/" className="brand"><img src="/logo.webp" alt={config.shopName} className="brand-logo" /></Link>
        <label className="search search-light">
          <SearchIcon size={18} />
          <input aria-label="Search vegetables" placeholder="Search tomato, palak, bhindi…" value={params.get('q') || ''} onChange={onSearch} />
        </label>
        <nav aria-label="Account" className="site-header-nav">
          {user?.role === 'admin' && <Link to="/admin" className="nav-link">Admin</Link>}
          {user?.role === 'delivery' && <Link to="/delivery" className="nav-link">Deliveries</Link>}
          <Link to="/bulk" className="nav-link">Bulk order</Link>
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

// SHOP_PHONE can list several numbers: "9005526038, 9956688958".
const phonesOf = (value) => (value || '').split(',').map((p) => p.replace(/\D/g, '').slice(-10)).filter((p) => p.length === 10);
const showPhone = (p) => `${p.slice(0, 5)} ${p.slice(5)}`;

function Footer({ onMobile }) {
  const { config } = useShop();
  const phones = phonesOf(config.shopPhone);
  const address = config.shopAddress;
  const mapQuery = encodeURIComponent(address || '');
  return (
    <footer className={`site-footer ${onMobile ? '' : 'desktop-only'}`}>
      <div className="container site-footer-grid">
        <div className="stack-sm">
          <strong>{config.shopName}</strong>
          <span>Fresh vegetables and fruits, delivered to your door.</span>
          <span className="footer-line"><ClockIcon size={16} />Order anytime, 5 AM – 10 PM</span>
          <Link to="/bulk" className="footer-line"><TruckIcon size={16} />Bulk &amp; event orders at special rates</Link>
          {!isNativeApp() && <span className="small">Order daily? Add this site to your home screen.</span>}
        </div>

        {phones.length > 0 && (
          <div className="stack-sm">
            <strong>Call or WhatsApp us</strong>
            <ul className="footer-contacts">
              {phones.map((p) => (
                <li key={p}>
                  <a href={`tel:+91${p}`} className="footer-line"><PhoneIcon size={16} />{showPhone(p)}</a>
                  <a href={`https://wa.me/91${p}`} target="_blank" rel="noreferrer" className="footer-chip">WhatsApp</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {address && (
          <div className="stack-sm">
            <strong>Visit our shop</strong>
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`} target="_blank" rel="noreferrer"
              className="footer-visit" title="Get directions in Google Maps">
              <span className="footer-pin"><PinIcon size={20} /></span>
              <span>{address}<span className="footer-visit-hint">Get directions ↗</span></span>
            </a>
          </div>
        )}
      </div>
    </footer>
  );
}
