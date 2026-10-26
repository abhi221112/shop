import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './state';
import Login from './Login';
import ShopLayout from './shop/ShopLayout';
import Home from './shop/Home';
import Categories from './shop/Categories';
import Cart from './shop/Cart';
import Checkout from './shop/Checkout';
import Orders from './shop/Orders';
import Tracking from './shop/Tracking';
import Account from './shop/Account';
import Refer from './shop/Refer';
import Bulk from './shop/Bulk';
import AdminOffers from './admin/AdminOffers';
import AdminCombos from './admin/AdminCombos';
import AdminComplaints from './admin/AdminComplaints';
import AdminLayout from './admin/AdminLayout';
import AdminOrders from './admin/AdminOrders';
import AdminPrices from './admin/AdminPrices';
import AdminStaff from './admin/AdminStaff';
import AdminSlots from './admin/AdminSlots';
import PackingList from './admin/PackingList';
import AdminCustomers from './admin/AdminCustomers';
import AdminReports from './admin/AdminReports';
import AdminEvents from './admin/AdminEvents';
import DeliveryList from './delivery/DeliveryList';
import DeliveryOrder from './delivery/DeliveryOrder';

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ShopLayout />}>
        <Route index element={<Home />} />
        <Route path="categories" element={<Categories />} />
        <Route path="cart" element={<Cart />} />
        <Route path="bulk" element={<Bulk />} />
        <Route path="checkout" element={<RequireRole><Checkout /></RequireRole>} />
        <Route path="orders" element={<RequireRole><Orders /></RequireRole>} />
        <Route path="orders/:id" element={<RequireRole><Tracking /></RequireRole>} />
        <Route path="account" element={<RequireRole><Account /></RequireRole>} />
        <Route path="refer" element={<RequireRole><Refer /></RequireRole>} />
      </Route>

      <Route path="admin" element={<RequireRole roles={['admin']}><AdminLayout /></RequireRole>}>
        <Route index element={<AdminOrders />} />
        <Route path="prices" element={<AdminPrices />} />
        <Route path="staff" element={<AdminStaff />} />
        <Route path="slots" element={<AdminSlots />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="offers" element={<AdminOffers />} />
        <Route path="combos" element={<AdminCombos />} />
        <Route path="complaints" element={<AdminComplaints />} />
        <Route path="events" element={<AdminEvents />} />
        <Route path="reports" element={<AdminReports />} />
      </Route>
      <Route path="admin/packing" element={<RequireRole roles={['admin']}><PackingList /></RequireRole>} />

      <Route path="delivery" element={<RequireRole roles={['delivery', 'admin']}><DeliveryList /></RequireRole>} />
      <Route path="delivery/:id" element={<RequireRole roles={['delivery', 'admin']}><DeliveryOrder /></RequireRole>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
