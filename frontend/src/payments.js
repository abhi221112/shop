import { api } from './api';
import { rupees } from './format';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment page. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

/**
 * Runs the UPI payment for an order. Resolves to the updated order when paid,
 * or null when the customer closes the payment window.
 */
export async function payForOrder(order, user) {
  const pay = await api(`/orders/${order.id}/pay`, { method: 'POST' });

  if (pay.mode === 'mock') {
    // No Razorpay keys configured: simulate a successful UPI payment.
    if (!window.confirm(`Test payment mode\n\nPay ${rupees(pay.amount)} for order ${order.code}?`)) return null;
    return api(`/orders/${order.id}/pay/verify`, { method: 'POST', body: { mock: true } });
  }

  await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: pay.keyId,
      order_id: pay.gatewayOrderId,
      amount: Math.round(pay.amount * 100),
      currency: 'INR',
      name: pay.shopName,
      description: `Order ${order.code}`,
      prefill: { contact: user?.phone, name: user?.name },
      method: { upi: true },
      theme: { color: '#1E6B3A' },
      handler: (resp) => api(`/orders/${order.id}/pay/verify`, { method: 'POST', body: resp }).then(resolve, reject),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on('payment.failed', () => resolve(null));
    rzp.open();
  });
}
