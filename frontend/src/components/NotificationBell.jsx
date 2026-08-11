import { useEffect, useMemo, useRef, useState } from 'react';
import './NotificationBell.css';

const typeLabels = {
  danger: 'Crítico',
  warning: 'Atenção',
  success: 'Resolvido',
  info: 'Aviso',
};

function NotificationBell({
  items = [],
  title = 'Notificações',
  emptyTitle = 'Nenhuma pendência crítica',
  emptyText = 'Tudo certo no momento.',
  align = 'right',
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const visibleItems = useMemo(() => items.filter(Boolean), [items]);
  const unreadCount = visibleItems.filter(item => item.unread !== false).length;

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const handleAction = (item) => {
    item.onAction?.();
    setOpen(false);
  };

  return (
    <div className={`notification-bell-wrap align-${align}`} ref={wrapperRef}>
      <button
        type="button"
        className={`notification-bell-button ${unreadCount ? 'has-items' : ''}`}
        onClick={() => setOpen(current => !current)}
        aria-label={`${title}${unreadCount ? `: ${unreadCount} pendência${unreadCount === 1 ? '' : 's'}` : ''}`}
        aria-expanded={open}
        title={title}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22a2.7 2.7 0 0 0 2.55-1.85h-5.1A2.7 2.7 0 0 0 12 22Zm7-6.2-1.35-1.35V10a5.7 5.7 0 0 0-4.4-5.55V3.7a1.25 1.25 0 1 0-2.5 0v.75A5.7 5.7 0 0 0 6.35 10v4.45L5 15.8V18h14v-2.2Z" />
        </svg>
        {unreadCount > 0 && <span className="notification-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-drawer" aria-label={title}>
          <div className="notification-drawer-head">
            <div>
              <span>Central DRM</span>
              <strong>{title}</strong>
            </div>
            <em>{unreadCount || 0}</em>
          </div>

          <div className="notification-drawer-list">
            {visibleItems.length ? visibleItems.map(item => (
              <article className={`notification-item ${item.type || 'info'}`} key={item.id || item.title}>
                <div className="notification-item-dot" aria-hidden="true"></div>
                <div className="notification-item-body">
                  <span>{typeLabels[item.type] || typeLabels.info}</span>
                  <strong>{item.title}</strong>
                  {item.description && <p>{item.description}</p>}
                  {item.meta && <small>{item.meta}</small>}
                  {item.actionLabel && (
                    <button type="button" onClick={() => handleAction(item)}>
                      {item.actionLabel}
                    </button>
                  )}
                </div>
              </article>
            )) : (
              <div className="notification-empty">
                <strong>{emptyTitle}</strong>
                <p>{emptyText}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
