import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm]       = useState({ current_password: '', new_password: '', confirm: '' });
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving]   = useState(false);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setError('');
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.new_password.length < 6) {
      return setError('New password must be at least 6 characters');
    }
    if (form.new_password !== form.confirm) {
      return setError('New passwords do not match');
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      setSuccess(true);
      setForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Change Password</h1>
          <p className="page-subtitle">Signed in as <strong>{user?.username}</strong></p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>

      <div className="card" style={{ maxWidth: 480, padding: '28px 28px 24px' }}>
        {error && <div className="error-banner">{error}</div>}
        {success && (
          <div style={{
            background: '#dcfce7', color: '#16a34a',
            padding: '10px 14px', borderRadius: 8,
            fontSize: 13, marginBottom: 18, border: '1px solid #bbf7d0',
          }}>
            Password changed successfully.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input
              type="password"
              className="form-input"
              value={form.current_password}
              onChange={(e) => set('current_password', e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input
              type="password"
              className="form-input"
              value={form.new_password}
              onChange={(e) => set('new_password', e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input
              type="password"
              className="form-input"
              value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div style={{ marginTop: 4 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
