import React, { useEffect, useState } from 'react';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

const LEVELS = ['confirmed', 'unverified', 'incompatible'];
const COMMON_PLATFORMS = ['Cisco', 'Juniper', 'Arista', 'Dell', 'HPE', 'Brocade', 'Extreme', 'Cumulus'];

function CompatBadge({ level }) {
  return <span className={`compat-badge compat-${level}`}>{level}</span>;
}

function PlatformChips({ platforms, label }) {
  if (!platforms?.length) return <span style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {platforms.map(p => (
        <span key={p} style={{
          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 8,
          background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
        }}>{p}</span>
      ))}
    </div>
  );
}

function PlatformInput({ value, onChange, placeholder }) {
  const [input, setInput] = useState('');

  const add = (p) => {
    const trimmed = p.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (p) => onChange(value.filter(x => x !== p));

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {value.map(p => (
          <span key={p} style={{
            fontSize: 12, fontWeight: 600, padding: '3px 10px 3px 10px', borderRadius: 20,
            background: 'var(--color-accent-faint)', color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {p}
            <button
              type="button"
              onClick={() => remove(p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}
            >×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          className="form-input"
          placeholder={placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(input); } }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => add(input)}>Add</button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {COMMON_PLATFORMS.filter(p => !value.includes(p)).map(p => (
          <button
            key={p}
            type="button"
            className="btn btn-secondary"
            style={{ padding: '3px 8px', fontSize: 11 }}
            onClick={() => add(p)}
          >
            + {p}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMPTY_FORM = { transceiver_model: '', compatible_platforms: [], incompatible_platforms: [], notes: '', compat_level: 'unverified' };

export default function OpticCompatibility() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const load = () => {
    api.get('/optics/').then(res => setRows(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      transceiver_model: row.transceiver_model,
      compatible_platforms: row.compatible_platforms || [],
      incompatible_platforms: row.incompatible_platforms || [],
      notes: row.notes || '',
      compat_level: row.compat_level,
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.transceiver_model.trim()) { setError('Transceiver model is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/optics/${editing.id}`, form);
      } else {
        await api.post('/optics/', form);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.transceiver_model}"?`)) return;
    try {
      await api.delete(`/optics/${row.id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed');
    }
  };

  const filtered = rows.filter(r =>
    !search || r.transceiver_model.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Optic Compatibility</h1>
          <p className="page-subtitle">Transceiver compatibility table used by Clone-a-Rack</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={openCreate}>+ Add Entry</button>
        )}
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Entries</div>
          <div className="stat-value">{rows.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Confirmed</div>
          <div className="stat-value" style={{ color: 'var(--color-success-text)' }}>
            {rows.filter(r => r.compat_level === 'confirmed').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unverified</div>
          <div className="stat-value" style={{ color: 'var(--color-warn-text)' }}>
            {rows.filter(r => r.compat_level === 'unverified').length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Incompatible</div>
          <div className="stat-value" style={{ color: 'var(--color-danger)' }}>
            {rows.filter(r => r.compat_level === 'incompatible').length}
          </div>
        </div>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          className="search-input"
          placeholder="Search transceiver model…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128268;</div>
            <div className="empty-title">No optic entries yet</div>
            <div className="empty-text">
              {isAdmin ? 'Add compatibility entries to enable optic flagging in Clone-a-Rack.' : 'No entries found.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Transceiver Model</th>
                  <th>Status</th>
                  <th>Compatible With</th>
                  <th>Incompatible With</th>
                  <th>Notes</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id}>
                    <td className="col-name">{row.transceiver_model}</td>
                    <td><CompatBadge level={row.compat_level} /></td>
                    <td><PlatformChips platforms={row.compatible_platforms} /></td>
                    <td><PlatformChips platforms={row.incompatible_platforms} /></td>
                    <td className="col-desc">{row.notes || '—'}</td>
                    {isAdmin && (
                      <td>
                        <div className="col-actions">
                          <button className="btn-icon" title="Edit" onClick={() => openEdit(row)}>✎</button>
                          <button className="btn-icon danger" title="Delete" onClick={() => handleDelete(row)}>✕</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit Optic Entry' : 'New Optic Entry'}</h2>
              <button className="btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-banner">{error}</div>}

              <div className="form-group">
                <label className="form-label">Transceiver Model *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. SFP-10G-SR, QSFP-40G-LR4"
                  value={form.transceiver_model}
                  onChange={e => setForm(f => ({ ...f, transceiver_model: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Compatibility Status</label>
                <select
                  className="form-input"
                  value={form.compat_level}
                  onChange={e => setForm(f => ({ ...f, compat_level: e.target.value }))}
                >
                  {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Compatible Platforms</label>
                <PlatformInput
                  value={form.compatible_platforms}
                  onChange={v => setForm(f => ({ ...f, compatible_platforms: v }))}
                  placeholder="Type platform name, press Enter"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Incompatible Platforms</label>
                <PlatformInput
                  value={form.incompatible_platforms}
                  onChange={v => setForm(f => ({ ...f, incompatible_platforms: v }))}
                  placeholder="Type platform name, press Enter"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Optional notes or caveats…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Entry')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
