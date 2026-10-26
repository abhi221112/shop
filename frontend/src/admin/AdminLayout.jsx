import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api';
import { useShop } from '../state';

const LINKS = [
  ['/admin', "Today's orders"],
  ['/admin/events', 'Event orders'],
  ['/admin/complaints', 'Complaints'],
  ['/admin/prices', 'Prices & stock'],
  ['/admin/offers', 'Offers'],
  ['/admin/combos', 'Combo packs'],
  ['/admin/slots', 'Delivery slots'],
  ['/admin/staff', 'Delivery staff'],
  ['/admin/customers', 'Customers'],
  ['/admin/reports', 'Reports'],
];

export default function AdminLayout() {
  const { config } = useShop();
  const { pathname } = useLocation();
  const [counts, setCounts] = useState({});
  useEffect(() => {
    api('/admin/summary')
      .then((s) => setCounts({ '/admin/complaints': s.pendingComplaints || 0, '/admin/events': s.newEvents || 0 }))
      .catch(() => {});
  }, [pathname]);
  return (
    <div className="admin">
      <aside className="admin-side">
        <span className="admin-brand">{config.shopName} Admin</span>
        <nav aria-label="Admin" className="admin-nav">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `admin-nav-link ${isActive ? 'is-active' : ''}`}>
              {label}
              {counts[to] > 0 && <span className="nav-count" aria-label={`${counts[to]} waiting`}>{counts[to]}</span>}
            </NavLink>
          ))}
          <Link to="/" className="admin-nav-link admin-nav-shop">View shop →</Link>
        </nav>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
