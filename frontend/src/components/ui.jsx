import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { assetUrl } from '../api';
import { BackIcon } from './Icons';

export function ProductImage({ product, className = '' }) {
  const [broken, setBroken] = useState(false);
  if (product.imageUrl && !broken) {
    return <img className={`product-img ${className}`} src={assetUrl(product.imageUrl)} alt={product.name} loading="lazy" onError={() => setBroken(true)} />;
  }
  return (
    <div className={`product-img product-img-placeholder ${className}`} style={{ background: product.tint }} aria-hidden="true">
      {product.name.charAt(0)}
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="spinner-wrap" role="status"><span className="spinner" /><span>{label}</span></div>
);

export const ErrorNote = ({ children }) => (children ? <p className="error-note" role="alert">{children}</p> : null);

/** Page header used by inner screens on phones: back arrow + title. */
export function PageHeader({ title, back }) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      {back ? (
        <Link to={back} className="icon-btn" aria-label="Back"><BackIcon /></Link>
      ) : (
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}><BackIcon /></button>
      )}
      <h1>{title}</h1>
    </header>
  );
}

/** Runs `load` on mount and every `intervalMs` (when set). */
export function usePolling(load, intervalMs, deps = []) {
  useEffect(() => {
    load();
    if (!intervalMs) return undefined;
    const t = setInterval(load, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Toggle({ on, onChange, label, onText = 'On', offText = 'Off' }) {
  return (
    <button type="button" className={`toggle ${on ? 'is-on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)}>
      <span className="toggle-track"><span className="toggle-knob" /></span>
      <span>{on ? onText : offText}</span>
    </button>
  );
}
