import { useState } from 'react';
import { rupees } from '../format';
import { ShareIcon, WalletIcon } from '../components/Icons';
import { PageHeader, Spinner } from '../components/ui';
import { usePerks, useShop } from '../state';
import { WalletHistory } from './Offers';

export default function Refer() {
  const perks = usePerks();
  const { config } = useShop();
  const [copied, setCopied] = useState(false);
  if (!perks) return <div className="page-narrow"><PageHeader title="Refer & earn" back="/account" /><Spinner /></div>;

  const r = perks.referral;
  const amount = rupees(r.amount);
  const link = r.shareUrl || `${window.location.origin}/?ref=${r.code}`;
  const message = `I buy fresh vegetables from ${config.shopName}. Use my code ${r.code} and get ${amount} off your first order: ${link}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch { /* clipboard blocked: the code is visible on screen */ }
  }
  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: config.shopName, text: message }); return; } catch { /* cancelled */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  return (
    <div className="page-narrow">
      <PageHeader title="Refer & earn" back="/account" />
      <div className="page-body">
        <section className="card wallet-card">
          <span className="offer-icon"><WalletIcon size={22} /></span>
          <span className="stack-xs grow">
            <span className="small">Wallet balance</span>
            <strong className="huge">{rupees(perks.wallet)}</strong>
            <span className="small">
              {perks.walletUsablePerOrder < perks.wallet
                ? `Up to ${rupees(perks.walletUsablePerOrder)} is used on your next order; refunds are spread over several orders.`
                : 'Used automatically on your next order'}
            </span>
          </span>
        </section>

        {r.enabled ? (
          <section className="card stack-sm refer-box">
            <h2 className="card-title">Give {amount}, get {amount}</h2>
            <ol className="refer-steps">
              <li>Share your code with friends and neighbours.</li>
              <li>They get <strong>{amount}</strong> in their wallet when they sign up with it.</li>
              <li>You get <strong>{amount}</strong> when their first order is delivered.</li>
            </ol>
            <div className="code-box">
              <span className="small muted">Your code</span>
              <strong className="code-big">{r.code}</strong>
            </div>
            <div className="row gap wrap">
              <button className="btn btn-primary grow" onClick={share}><ShareIcon size={18} />Share on WhatsApp</button>
              <button className="btn btn-outline" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</button>
            </div>
            <span className="small muted">{r.friendsJoined} friends joined · {r.friendsOrdered} ordered</span>
          </section>
        ) : <p className="muted">Referrals are paused right now.</p>}

        {perks.walletCredits?.length > 0 && (
          <section className="card stack-sm">
            <h2 className="card-title">Your credits</h2>
            <ul className="wallet-list">
              {perks.walletCredits.map((cr, i) => (
                <li key={i} className="row-between">
                  <span className="stack-xs">
                    <span>{cr.reason}</span>
                    <span className="muted small">
                      {rupees(cr.remaining)} left of {rupees(cr.amount)}
                      {cr.perOrderCap ? ` · up to ${rupees(cr.perOrderCap)} per order` : ' · no limit per order'}
                    </span>
                  </span>
                  <strong>{rupees(cr.remaining)}</strong>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card stack-sm">
          <h2 className="card-title">Wallet history</h2>
          <WalletHistory items={perks.walletHistory} />
        </section>
      </div>
    </div>
  );
}
