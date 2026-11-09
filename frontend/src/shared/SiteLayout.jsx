import React from 'react';

export function SiteHeader({ className = 'topbar', badge, navigation = [], children, brandHref = '/' }) {
  return (
    <header className={className}>
      <a className="brand" href={brandHref}>
        <span className="brand-mark">b</span>
        <span>book<span className="brand-accent">swap</span></span>
        {badge && <span className="admin-badge">{badge}</span>}
      </a>
      {navigation.length > 0 && (
        <nav className="main-nav" aria-label="Điều hướng chính">
          {navigation.map(({ id, label, active, onClick }) => (
            <button key={id} className={active ? 'nav-link active' : 'nav-link'} onClick={onClick}>{label}</button>
          ))}
        </nav>
      )}
      {children && <div className="account-actions">{children}</div>}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer">
      <a className="brand" href="/"><span className="brand-mark">b</span><span>book<span className="brand-accent">swap</span></span></a>
      <p>Đọc thêm. Chia sẻ nhiều. Sống xanh hơn.</p>
      <span>© 2025 BookSwap</span>
    </footer>
  );
}
