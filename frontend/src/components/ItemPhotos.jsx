/**
 * ItemPhotos — photo gallery section for inventory items.
 *
 * Props:
 *   itemId    {number}  - inventory item ID
 *   itemType  {string}  - 'consumable' or 'asset'
 *   hasSerial {boolean} - whether the asset has a serial number set
 *   canEdit   {boolean} - manager/admin can upload and delete
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api.jsx';

function Lightbox({ photo, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <img
        src={photo.url}
        alt={photo.label || photo.filename}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%', maxHeight: '80vh',
          borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}
      />
      {photo.label && (
        <div style={{ marginTop: 12, color: '#fff', fontSize: 14, textAlign: 'center' }}>
          {photo.label}
        </div>
      )}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none',
          borderRadius: '50%', width: 36, height: 36,
          color: '#fff', fontSize: 18, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        aria-label="Close"
      >&#10005;</button>
    </div>
  );
}

function ConfirmDeleteDialog({ onConfirm, onCancel, busy }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog">
        <div className="confirm-title">Delete photo?</div>
        <div className="confirm-text">This photo will be permanently removed.</div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-danger-outline" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemPhotos({ itemId, itemType, hasSerial, canEdit }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const apiBase = itemType === 'consumable'
    ? `/consumables/${itemId}/photos`
    : `/assets/${itemId}/photos`;

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(apiBase);
      setPhotos(res.data);
    } catch {
      // silently ignore — item may not support photos yet
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(apiBase, fd);
      }
      await loadPhotos();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Upload failed. Ensure files are JPEG, PNG, or WebP under 10 MB.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`${apiBase}/${deleteTarget.id}`);
      setDeleteTarget(null);
      await loadPhotos();
    } catch (err) {
      setError(err.response?.data?.detail || 'Delete failed');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }

  // Asset with no serial number: show info message instead of upload zone
  if (itemType === 'asset' && !hasSerial) {
    return (
      <div style={{ marginTop: 20, padding: '12px 16px', borderRadius: 6,
        background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)',
        fontSize: 13, textAlign: 'center' }}>
        Set a serial number on this asset to enable photo uploads.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--color-text)' }}>
        Photos
      </div>

      {error && (
        <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>
      )}

      {/* Thumbnail grid */}
      {!loading && photos.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: 8, marginBottom: 12,
        }}>
          {photos.map((photo) => (
            <div key={photo.id} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden',
              aspectRatio: '1', background: 'var(--color-surface-alt)' }}>
              <img
                src={photo.url}
                alt={photo.label || photo.filename}
                onClick={() => setLightboxPhoto(photo)}
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  cursor: 'pointer', display: 'block',
                }}
              />
              {photo.label && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                  fontSize: 10, padding: '2px 4px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {photo.label}
                </div>
              )}
              {canEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(photo); }}
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(220,38,38,0.85)', border: 'none',
                    borderRadius: '50%', width: 22, height: 22,
                    color: '#fff', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}
                  aria-label="Delete photo"
                >&#10005;</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload zone — only for editor roles */}
      {canEdit && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 8, padding: '16px 12px',
            textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
            background: dragOver ? 'var(--color-accent-faint)' : 'transparent',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ fontSize: 22, marginBottom: 4 }}>&#128247;</div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {uploading
              ? 'Uploading…'
              : 'Tap to upload or drag photos here'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            JPEG, PNG, WebP · max 10 MB each
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>
      )}

      {!loading && photos.length === 0 && !canEdit && (
        <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No photos attached.</div>
      )}

      {lightboxPhoto && (
        <Lightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={deleting}
        />
      )}
    </div>
  );
}
