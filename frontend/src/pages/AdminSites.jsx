import React, { useEffect, useState } from 'react';
import api from '../api.jsx';

const EMPTY_CREATE = { name: '', short_code: '', address: '' };

function SiteModal({ site, onSave, onClose, saving }) {
  const isEdit = !!site;
  const [form, setForm] = useState(
    isEdit
      ? { name: site.name, short_code: site.short_code, address: site.address || '' }
      : EMPTY_CREATE
  );
  const [error, setError] = useState('');

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Name is required');
    if (!form.short_code.trim()) return setError('Short code is required');
    try {
      await onSave(site?.id ?? null, {
        name: form.name.trim(),
        short_code: form.short_code.trim().toUpperCase(),
        address: form.address.trim() || null,
      });
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? `Edit ${site.name}` : 'Add Site'}</h2>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">&#10005;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
            <div className="form-grid">
              <div className="form-group form-col-span">
                <label className="form-label">Site Name *</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. London Data Centre"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Short Code *</label>
                <input
                  className="form-input"
                  value={form.short_code}
                  onChange={(e) => set('short_code', e.target.value.toUpperCase())}
                  placeholder="e.g. LDN"
                  maxLength={20}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input
                  className="form-input"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Optional street address"
                />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel, busy }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog">
        <div className="confirm-title">Deactivate site?</div>
        <div className="confirm-text">{message}</div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn btn-danger-outline" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deactivating...' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminSites() {
  const [sites, setSites]           = useState([]);
  const [fetching, setFetching]     = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editSite, setEditSite]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating]         = useState(false);
  const [error, setError]           = useState('');

  const load = async () => {
    setFetching(true);
    try {
      const res = await api.get('/admin/sites/');
      setSites(res.data);
    } catch {
      setError('Failed to load sites');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (siteId, payload) => {
    setSaving(true);
    try {
      if (siteId) {
        await api.put(`/admin/sites/${siteId}`, payload);
      } else {
        await api.post('/admin/sites/', payload);
      }
      setShowModal(false);
      setEditSite(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await api.delete(`/admin/sites/${deactivateTarget.id}`);
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Deactivate failed');
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  };

  const handleReactivate = async (siteId) => {
    try {
      await api.put(`/admin/sites/${siteId}`, { active: true });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Reactivate failed');
    }
  };

  const openCreate = () => { setEditSite(null); setShowModal(true); };
  const openEdit   = (s) => { setEditSite(s); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditSite(null); };

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sites</h1>
          <p className="page-subtitle">Physical locations for inventory and users</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Site</button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        {fetching ? (
          <div style={{ textAlign: 'center', padding: '56px', color: '#94a3b8' }}>Loading...</div>
        ) : sites.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#127968;</div>
            <div className="empty-title">No sites yet</div>
            <div className="empty-text">Add your first site to start organising inventory by location.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td><span className="col-name">{s.name}</span></td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                        background: 'var(--color-accent-faint)', color: 'var(--color-accent)',
                      }}>
                        {s.short_code}
                      </span>
                    </td>
                    <td className="col-location">{s.address || '—'}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13,
                        color: s.active ? '#16a34a' : '#dc2626',
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: s.active ? '#16a34a' : '#dc2626',
                          display: 'inline-block',
                        }} />
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="col-date">
                      {new Date(s.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td>
                      <div className="col-actions">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(s)}>&#9998;</button>
                        {s.active ? (
                          <button
                            className="btn-icon danger"
                            title="Deactivate"
                            onClick={() => setDeactivateTarget(s)}
                          >
                            &#128465;
                          </button>
                        ) : (
                          <button
                            className="btn-icon"
                            title="Reactivate"
                            onClick={() => handleReactivate(s.id)}
                            style={{ color: '#16a34a' }}
                          >
                            &#10227;
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="table-footer">{sites.length} site{sites.length !== 1 ? 's' : ''}</div>

      {showModal && (
        <SiteModal
          site={editSite}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          message={`"${deactivateTarget.name}" will be marked inactive. Existing items keep their site assignment.`}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          busy={deactivating}
        />
      )}
    </main>
  );
}
