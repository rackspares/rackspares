/**
 * ItemDetailPane — slide-in right panel showing full item details.
 *
 * Props:
 *   item     {object}   - the inventory item to display
 *   onClose  {fn}       - called when the pane should close
 *   onEdit   {fn}       - called to open the edit modal for this item
 *   onDelete {fn}       - called to initiate delete for this item
 *   canEdit  {boolean}  - whether the current user can edit/delete
 */
import React, { useEffect } from 'react';
import ItemPhotos from './ItemPhotos.jsx';
import StatusBadge from './StatusBadge.jsx';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function Field({ label, children }) {
  if (!children && children !== 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--color-text)' }}>{children}</div>
    </div>
  );
}

export default function ItemDetailPane({ item, onClose, onEdit, onDelete, canEdit }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isConsumable = item.item_type === 'consumable';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.35)',
        }}
      />

      {/* Pane */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 301,
          width: 'min(480px, 100vw)',
          background: 'var(--color-bg-card)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0, background: 'var(--color-bg-card)', zIndex: 1,
        }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700,
              color: 'var(--color-text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
              {item.name}
            </h2>
            {item.serial_number && (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                S/N: {item.serial_number}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
            style={{ flexShrink: 0, fontSize: 16 }}
          >&#10005;</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', flex: 1 }}>

          {/* Badges row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            <span className={`item-type-badge item-type-${item.item_type}`}>
              {isConsumable ? 'Consumable' : 'Asset'}
            </span>
            <span className={`condition-badge condition-${item.condition || 'new'}`}>
              {item.condition === 'used' ? 'Used' : 'New'}
            </span>
            <StatusBadge status={item.status} />
          </div>

          {/* Two-column grid for key fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <Field label="Quantity">
              <span style={{ fontWeight: 600, fontSize: 16 }}>{item.quantity}</span>
              {isConsumable && item.minimum_stock != null && item.quantity < item.minimum_stock && (
                <span style={{ marginLeft: 8, color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
                  ⚠ Below min ({item.minimum_stock})
                </span>
              )}
            </Field>

            <Field label="Category">{item.category?.name || '—'}</Field>

            <Field label="Location">{item.location || '—'}</Field>

            <Field label="Site">
              {item.site
                ? `${item.site.short_code} — ${item.site.name}`
                : '—'}
            </Field>

            {item.serial_number && (
              <Field label="Serial Number">
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{item.serial_number}</span>
              </Field>
            )}

            {isConsumable && item.minimum_stock != null && (
              <Field label="Min Stock">{item.minimum_stock}</Field>
            )}

            {isConsumable && item.lead_time_days != null && (
              <Field label="Lead Time">{item.lead_time_days} day{item.lead_time_days !== 1 ? 's' : ''}</Field>
            )}
          </div>

          {/* Description */}
          {item.description && (
            <Field label="Description">
              <span style={{ whiteSpace: 'pre-wrap' }}>{item.description}</span>
            </Field>
          )}

          {/* Purchase URL */}
          {item.purchase_url && (
            <Field label="Purchase / Order URL">
              <a
                href={item.purchase_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--color-accent)',
                  textDecoration: 'none',
                  fontSize: 13,
                  wordBreak: 'break-all',
                }}
              >
                {item.purchase_url} ↗
              </a>
            </Field>
          )}

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px',
            paddingTop: 12, borderTop: '1px solid var(--color-border)', marginTop: 4 }}>
            <Field label="Date Added">{fmt(item.date_added)}</Field>
            <Field label="Last Updated">{fmt(item.last_updated)}</Field>
            <Field label="Last Verified">{fmt(item.last_verified)}</Field>
          </div>

          {/* Photos */}
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginTop: 4 }}>
            <ItemPhotos
              itemId={item.id}
              itemType={item.item_type}
              hasSerial={!!item.serial_number}
              canEdit={canEdit}
            />
          </div>
        </div>

        {/* Footer actions */}
        {canEdit && (
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', gap: 8,
            position: 'sticky', bottom: 0,
            background: 'var(--color-bg-card)',
          }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={onEdit}>
              &#9998; Edit
            </button>
            <button className="btn btn-danger-outline" onClick={onDelete}>
              &#128465; Delete
            </button>
          </div>
        )}
      </div>
    </>
  );
}
