import React, { useEffect, useRef, useState } from 'react';
import api from '../api.jsx';

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString();
}

export default function NetboxSettings() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ mode: 'external', api_url: '', token: '', auto_sync_interval_minutes: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [error, setError] = useState('');

  // Logo upload state
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    Promise.all([
      api.get('/netbox/config'),
      api.get('/preferences/company'),
    ]).then(([cfgRes, compRes]) => {
      const c = cfgRes.data;
      setConfig(c);
      setForm({
        mode: c.mode,
        api_url: c.api_url || '',
        token: '',
        auto_sync_interval_minutes: c.auto_sync_interval_minutes,
      });
      setLogoUrl(compRes.data.logo_url || null);
    }).catch(() => setError('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        mode: form.mode,
        api_url: form.api_url || null,
        auto_sync_interval_minutes: Number(form.auto_sync_interval_minutes),
      };
      if (form.token.trim()) payload.token = form.token.trim();
      const res = await api.put('/netbox/config', payload);
      setConfig(res.data);
      setForm(f => ({ ...f, token: '' }));
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await api.post('/netbox/test-connection');
      setTestResult({ ok: true, msg: `Connected — Netbox ${res.data.netbox_version}` });
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.detail || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError('');
    try {
      const res = await api.post('/netbox/sync');
      const s = res.data.stats;
      setSyncResult({ ok: true, msg: `Synced: ${s.sites} sites, ${s.racks} racks, ${s.device_types} device types, ${s.devices} devices` });
      // Reload config for updated sync time
      const cfgRes = await api.get('/netbox/config');
      setConfig(cfgRes.data);
    } catch (err) {
      setSyncResult({ ok: false, msg: err.response?.data?.detail || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/preferences/logo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLogoUrl(res.data.logo_url);
      setLogoMsg('Logo uploaded successfully');
    } catch (err) {
      setLogoMsg(err.response?.data?.detail || 'Upload failed');
    } finally {
      setLogoUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!window.confirm('Remove company logo?')) return;
    try {
      await api.delete('/preferences/logo');
      setLogoUrl(null);
      setLogoMsg('Logo removed');
    } catch (err) {
      setLogoMsg(err.response?.data?.detail || 'Delete failed');
    }
  };

  if (loading) return <div className="loading">Loading settings…</div>;

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Netbox Settings</h1>
          <p className="page-subtitle">Configure Netbox integration and company branding</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(420px,1fr))' }}>

        {/* ── Connection config ── */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="settings-section-title">Netbox Connection</h2>

          <div className="form-group">
            <label className="form-label">Mode</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {['external', 'builtin'].map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--color-text)', fontSize: 14 }}>
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={form.mode === m}
                    onChange={() => setForm(f => ({ ...f, mode: m }))}
                  />
                  {m === 'external' ? 'External (existing Netbox)' : 'Built-in (Docker)'}
                </label>
              ))}
            </div>
            {form.mode === 'builtin' && (
              <div className="info-banner" style={{ marginTop: 12 }}>
                Run <code className="font-mono">docker compose --profile netbox up -d</code> to start the built-in Netbox container, then configure its URL below.
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">API URL</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://netbox.example.com"
              value={form.api_url}
              onChange={e => setForm(f => ({ ...f, api_url: e.target.value }))}
            />
            <div className="form-error" style={{ color: 'var(--color-text-faint)', marginTop: 4 }}>
              Include protocol, no trailing slash. The API token path <code>/api/</code> is appended automatically.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">API Token {config?.has_token && <span style={{ fontWeight: 400, color: 'var(--color-success-text)' }}>(token saved)</span>}</label>
            <input
              type="password"
              className="form-input"
              placeholder={config?.has_token ? '••••••••  (leave blank to keep existing)' : 'Enter Netbox API token'}
              value={form.token}
              onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Auto-sync interval (minutes, 0 = disabled)</label>
            <input
              type="number"
              className="form-input"
              min="0"
              step="15"
              value={form.auto_sync_interval_minutes}
              onChange={e => setForm(f => ({ ...f, auto_sync_interval_minutes: e.target.value }))}
              style={{ maxWidth: 160 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button className="btn btn-secondary" onClick={handleTest} disabled={testing || !config?.has_token}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>

          {testResult && (
            <div className={testResult.ok ? 'success-banner' : 'error-banner'} style={{ marginTop: 12 }}>
              {testResult.msg}
            </div>
          )}
        </div>

        {/* ── Sync status & controls ── */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="settings-section-title">Sync Status</h2>

          <div className="settings-row">
            <div>
              <div className="settings-label">Last successful sync</div>
              <div className="settings-desc">{fmt(config?.last_sync_at)}</div>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Last sync status</div>
              <div className="settings-desc" style={{
                color: config?.last_sync_status === 'ok'
                  ? 'var(--color-success-text)'
                  : config?.last_sync_status
                    ? 'var(--color-danger)'
                    : 'var(--color-text-faint)'
              }}>
                {config?.last_sync_status || 'Never synced'}
              </div>
            </div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-label">Auto-sync interval</div>
              <div className="settings-desc">
                {config?.auto_sync_interval_minutes
                  ? `Every ${config.auto_sync_interval_minutes} minutes`
                  : 'Disabled (manual only)'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleSync}
              disabled={syncing || !config?.has_token || !config?.api_url}
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 8 }}>
              Pulls sites, racks, device types and devices from Netbox into RackSpares.
            </div>
          </div>

          {syncResult && (
            <div className={syncResult.ok ? 'success-banner' : 'error-banner'} style={{ marginTop: 12 }}>
              {syncResult.msg}
            </div>
          )}
        </div>

        {/* ── Company Logo ── */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="settings-section-title">Company Logo</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Replaces the gear icon on the navbar and login page. PNG, JPEG, SVG or WebP recommended.
          </p>

          {logoUrl ? (
            <div className="logo-preview">
              <img src={logoUrl} alt="Company logo" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 8 }}>Current logo</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => fileRef.current?.click()} disabled={logoUploading}>
                    Replace
                  </button>
                  <button className="btn btn-danger-outline" onClick={handleLogoDelete}>
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="logo-upload-area"
              onClick={() => fileRef.current?.click()}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>&#128444;</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                {logoUploading ? 'Uploading…' : 'Click to upload company logo'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 4 }}>
                PNG, JPEG, GIF, SVG, WebP
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
            style={{ display: 'none' }}
            onChange={handleLogoUpload}
          />

          {logoMsg && (
            <div className="success-banner" style={{ marginTop: 12 }}>{logoMsg}</div>
          )}
        </div>

      </div>
    </div>
  );
}
