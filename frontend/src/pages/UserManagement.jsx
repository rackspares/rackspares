import React, { useEffect, useState } from 'react';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

const ROLES = ['admin', 'manager', 'viewer'];

const EMPTY_CREATE = { username: '', password: '', role: 'viewer' };
const EMPTY_EDIT   = { role: 'viewer', password: '', is_active: true };

function UserModal({ user, onSave, onClose, saving }) {
  const isEdit = !!user;
  const [form, setForm]   = useState(isEdit ? { role: user.role, password: '', is_active: user.is_active } : EMPTY_CREATE);
  const [error, setError] = useState('');

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        const payload = { role: form.role, is_active: form.is_active };
        if (form.password) payload.password = form.password;
        await onSave(user.id, payload);
      } else {
        if (!form.username.trim()) return setError('Username is required');
        if (form.password.length < 6) return setError('Password must be at least 6 characters');
        await onSave(null, form);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? `Edit ${user.username}` : 'Create User'}</h2>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">&#10005;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}
            <div className="form-grid">
              {!isEdit && (
                <div className="form-group form-col-span">
                  <label className="form-label">Username *</label>
                  <input
                    className="form-input"
                    value={form.username}
                    onChange={(e) => set('username', e.target.value)}
                    autoFocus
                    autoComplete="off"
                  />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-input" value={form.role} onChange={(e) => set('role', e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input
                  type="password"
                  className="form-input"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                  placeholder={isEdit ? 'Leave blank to keep current' : ''}
                />
              </div>
              {isEdit && (
                <div className="form-group form-col-span">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => set('is_active', e.target.checked)}
                    />
                    Account active
                  </label>
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers]       = useState([]);
  const [fetching, setFetching] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [ldapEnabled, setLdapEnabled] = useState(false);

  const load = async () => {
    setFetching(true);
    try {
      const [usersRes, ldapRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/admin/ldap').catch(() => ({ data: { enabled: false } })),
      ]);
      setUsers(usersRes.data);
      setLdapEnabled(ldapRes.data.enabled ?? false);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (userId, payload) => {
    setSaving(true);
    try {
      if (userId) {
        await api.put(`/auth/users/${userId}`, payload);
      } else {
        await api.post('/auth/users', payload);
      }
      setShowModal(false);
      setEditUser(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => { setEditUser(null); setShowModal(true); };
  const openEdit   = (u) => { setEditUser(u); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditUser(null); };

  const ROLE_COLORS = { admin: '#2563eb', manager: '#16a34a', viewer: '#64748b' };

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage accounts and roles</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add User</button>
      </div>

      {ldapEnabled && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: 16,
          background: '#2563eb18', color: '#2563eb', fontSize: 13,
        }}>
          LDAP is active. New users are auto-provisioned on first domain login as Viewer.
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {fetching ? (
          <div style={{ textAlign: 'center', padding: '56px', color: '#94a3b8' }}>Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Auth</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="col-name">{u.username}</span>
                      {u.id === me?.id && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#94a3b8' }}>(you)</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 9px',
                        borderRadius: 12,
                        fontSize: 12,
                        fontWeight: 600,
                        background: ROLE_COLORS[u.role] + '20',
                        color: ROLE_COLORS[u.role],
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        background: u.auth_type === 'ldap' ? '#7c3aed20' : '#64748b20',
                        color: u.auth_type === 'ldap' ? '#7c3aed' : '#64748b',
                      }}>
                        {u.auth_type === 'ldap' ? 'LDAP' : 'LOCAL'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 13, color: u.is_active ? '#16a34a' : '#dc2626',
                      }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: u.is_active ? '#16a34a' : '#dc2626',
                          display: 'inline-block',
                        }} />
                        {u.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="col-date">
                      {u.created_at
                        ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <div className="col-actions">
                        <button className="btn-icon" title="Edit" onClick={() => openEdit(u)}>&#9998;</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="table-footer">{users.length} user{users.length !== 1 ? 's' : ''}</div>

      {showModal && (
        <UserModal
          user={editUser}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      )}
    </main>
  );
}
