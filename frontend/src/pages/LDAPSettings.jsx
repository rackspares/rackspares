import React, { useEffect, useState } from 'react';
import api from '../api.jsx';

const DEFAULT_FILTER = '(sAMAccountName={username})';

const EMPTY = {
  server: '',
  port: 636,
  base_dn: '',
  bind_account: '',
  bind_password: '',
  user_search_filter: DEFAULT_FILTER,
  use_tls: true,
};

export default function LDAPSettings() {
  const [config, setConfig]         = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [changingPw, setChangingPw] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [testResult, setTestResult] = useState(null);  // null | { success, detail, users_found }
  const [testing, setTesting]       = useState(false);
  const [enabling, setEnabling]     = useState(false);
  const [enableError, setEnableError] = useState('');

  const load = async () => {
    try {
      const res = await api.get('/admin/ldap');
      setConfig(res.data);
      setForm({
        server:              res.data.server              || '',
        port:                res.data.port                ?? 636,
        base_dn:             res.data.base_dn             || '',
        bind_account:        res.data.bind_account        || '',
        bind_password:       '',
        user_search_filter:  res.data.user_search_filter  || DEFAULT_FILTER,
        use_tls:             res.data.use_tls             ?? true,
      });
    } catch (err) {
      console.error('Failed to load LDAP config', err);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setTestResult(null);
    try {
      const payload = { ...form };
      if (!changingPw || !payload.bind_password) {
        delete payload.bind_password;
      }
      await api.put('/admin/ldap', payload);
      setChangingPw(false);
      await load();
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setEnableError('');
    try {
      const res = await api.post('/admin/ldap/test');
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ success: false, detail: err.response?.data?.detail || 'Test failed', users_found: 0 });
    } finally {
      setTesting(false);
    }
  };

  const handleEnable = async () => {
    setEnabling(true);
    setEnableError('');
    try {
      await api.post('/admin/ldap/enable');
      await load();
      setTestResult(null);
    } catch (err) {
      setEnableError(err.response?.data?.detail || 'Enable failed');
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setEnabling(true);
    setEnableError('');
    try {
      await api.post('/admin/ldap/disable');
      await load();
      setTestResult(null);
    } catch (err) {
      setEnableError(err.response?.data?.detail || 'Disable failed');
    } finally {
      setEnabling(false);
    }
  };

  const isEnabled = config?.enabled ?? false;
  const canEnable = testResult?.success === true;

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">LDAP / Active Directory</h1>
          <p className="page-subtitle">Optional domain authentication</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isEnabled ? (
            <span style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              background: '#16a34a20', color: '#16a34a',
            }}>
              LDAP Active
            </span>
          ) : (
            <span style={{
              padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: '#94a3b820', color: '#94a3b8',
            }}>
              Local Auth
            </span>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 24, maxWidth: 640 }}>
        <form onSubmit={handleSave}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Server</label>
              <input
                className="form-input"
                value={form.server}
                onChange={(e) => set('server', e.target.value)}
                placeholder="ldap.company.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                type="number"
                className="form-input"
                value={form.port}
                onChange={(e) => set('port', Number(e.target.value))}
                min={1}
                max={65535}
              />
            </div>

            <div className="form-group form-col-span">
              <label className="form-label">Base DN</label>
              <input
                className="form-input"
                value={form.base_dn}
                onChange={(e) => set('base_dn', e.target.value)}
                placeholder="DC=company,DC=com"
              />
            </div>

            <div className="form-group form-col-span">
              <label className="form-label">Bind Account</label>
              <input
                className="form-input"
                value={form.bind_account}
                onChange={(e) => set('bind_account', e.target.value)}
                placeholder="svc-rackspares@company.com"
                autoComplete="off"
              />
            </div>

            <div className="form-group form-col-span">
              <label className="form-label">Bind Password</label>
              {config?.bind_password_set && !changingPw ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#94a3b8', fontFamily: 'monospace', letterSpacing: 2 }}>••••••••</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '3px 10px', fontSize: 12 }}
                    onClick={() => setChangingPw(true)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <input
                  type="password"
                  className="form-input"
                  value={form.bind_password}
                  onChange={(e) => set('bind_password', e.target.value)}
                  autoComplete="new-password"
                  placeholder="Service account password"
                />
              )}
            </div>

            <div className="form-group form-col-span">
              <label className="form-label">User Search Filter</label>
              <input
                className="form-input"
                value={form.user_search_filter}
                onChange={(e) => set('user_search_filter', e.target.value)}
                placeholder="(sAMAccountName={username})"
              />
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                Use <code style={{ background: '#0f172a', padding: '1px 4px', borderRadius: 3 }}>{'{username}'}</code> as the placeholder for the login username.
              </div>
            </div>

            <div className="form-group form-col-span">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.use_tls}
                  onChange={(e) => set('use_tls', e.target.checked)}
                />
                Use TLS (LDAPS)
              </label>
            </div>
          </div>

          {saveError && <div className="error-banner" style={{ marginBottom: 16 }}>{saveError}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>

      {/* Test connection */}
      <div className="card" style={{ padding: 24, maxWidth: 640, marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Test Connection</div>
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>

        {testResult && (
          <div style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: testResult.success ? '#16a34a18' : '#dc262618',
            color: testResult.success ? '#16a34a' : '#dc2626',
            fontSize: 13,
          }}>
            {testResult.success
              ? `Connection successful — ${testResult.users_found} user${testResult.users_found !== 1 ? 's' : ''} found`
              : `Failed: ${testResult.detail}`
            }
          </div>
        )}
      </div>

      {/* Enable / Disable */}
      <div className="card" style={{ padding: 24, maxWidth: 640, marginTop: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Authentication Mode</div>
        {enableError && (
          <div className="error-banner" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{enableError}</div>
        )}
        {isEnabled ? (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
              LDAP is currently active. Disabling will re-activate all local accounts.
            </div>
            <button
              className="btn btn-danger-outline"
              onClick={handleDisable}
              disabled={enabling}
            >
              {enabling ? 'Disabling…' : 'Disable LDAP'}
            </button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>
              Enabling LDAP will deactivate all local accounts. A successful connection test is required first.
            </div>
            <button
              className="btn btn-primary"
              onClick={handleEnable}
              disabled={!canEnable || enabling}
              title={!canEnable ? 'Run a successful connection test first' : undefined}
            >
              {enabling ? 'Enabling…' : 'Enable LDAP'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
