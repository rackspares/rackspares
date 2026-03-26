import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const STATUS_META = {
  draft:     { label: 'Draft',     cls: 'bom-status-badge bom-draft' },
  submitted: { label: 'Submitted', cls: 'bom-status-badge bom-submitted' },
  fulfilled: { label: 'Fulfilled', cls: 'bom-status-badge bom-fulfilled' },
};

export default function BOMs() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';
  const navigate = useNavigate();

  const [boms, setBoms]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew]   = useState(false);
  const [newName, setNewName]   = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [formErr, setFormErr]   = useState('');

  const fetchBoms = async () => {
    try {
      const res = await api.get('/boms/');
      setBoms(res.data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBoms(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) { setFormErr('Name is required'); return; }
    setCreating(true);
    setFormErr('');
    try {
      const res = await api.post('/boms/', { name: newName.trim(), description: newDesc.trim() || null });
      setShowNew(false);
      setNewName('');
      setNewDesc('');
      navigate(`/boms/${res.data.id}`);
    } catch (err) {
      setFormErr(err.response?.data?.detail || 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const draftCount     = boms.filter((b) => b.status === 'draft').length;
  const submittedCount = boms.filter((b) => b.status === 'submitted').length;
  const fulfilledCount = boms.filter((b) => b.status === 'fulfilled').length;

  return (
    <main className="main-content">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total BOMs</div>
          <div className="stat-value">{boms.length}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Draft</div>
          <div className="stat-value">{draftCount}</div>
          <div className="stat-sub">in progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Submitted</div>
          <div className="stat-value" style={{ color: submittedCount > 0 ? '#d97706' : '#0f172a' }}>
            {submittedCount}
          </div>
          <div className="stat-sub">awaiting fulfillment</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fulfilled</div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{fulfilledCount}</div>
          <div className="stat-sub">completed</div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">Bills of Materials</h1>
          <p className="page-subtitle">Track and fulfill parts requests</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => { setShowNew(true); setFormErr(''); }}>
            + New BOM
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#94a3b8' }}>Loading...</div>
        ) : boms.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128203;</div>
            <div className="empty-title">No BOMs yet</div>
            <div className="empty-text">
              {canEdit ? 'Create your first BOM to start tracking parts requests.' : 'No bills of materials have been created.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Items</th>
                  <th>Created by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {boms.map((bom) => {
                  const meta = STATUS_META[bom.status] || STATUS_META.draft;
                  return (
                    <tr
                      key={bom.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/boms/${bom.id}`)}
                    >
                      <td>
                        <div className="col-name">{bom.name}</div>
                        {bom.description && <div className="col-desc">{bom.description}</div>}
                      </td>
                      <td><span className={meta.cls}>{meta.label}</span></td>
                      <td style={{ color: '#64748b' }}>{bom.items.length}</td>
                      <td className="col-location">{bom.creator_username || '—'}</td>
                      <td className="col-date">{fmt(bom.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {boms.length > 0 && (
        <div className="table-footer">{boms.length} BOM{boms.length !== 1 ? 's' : ''}</div>
      )}

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New BOM</h2>
              <button className="btn-icon" onClick={() => setShowNew(false)}>&#10005;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  className={`form-input${formErr ? ' has-error' : ''}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rack expansion Q2"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                />
                {formErr && <div className="form-error">{formErr}</div>}
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Optional notes..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)} disabled={creating}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create BOM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
