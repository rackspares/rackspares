import React, { useCallback, useEffect, useState } from 'react';
import api from '../api.jsx';

const SERVICE_META = {
  netbox:    { label: 'NetBox',         icon: '🔌', credLabel: 'API Token',  hint: 'Generate in NetBox → Admin → API Tokens' },
  paperless: { label: 'Paperless-ngx',  icon: '📄', credLabel: 'API Token',  hint: 'Log in → Settings → API Auth Tokens' },
  n8n:       { label: 'n8n',            icon: '🔄', credLabel: 'API Key',    hint: 'Log in → Settings → n8n API → Create API Key' },
};

const STATUS_LABELS = {
  connected:      { label: 'Connected',      cls: 'service-status-connected' },
  unreachable:    { label: 'Unreachable',     cls: 'service-status-unreachable' },
  not_configured: { label: 'Not configured',  cls: 'service-status-none' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ConfigureModal({ service, onClose, onSaved }) {
  const meta = SERVICE_META[service];
  const [url, setUrl]       = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      await api.post(`/services/${service}/connect`, { url, api_key: apiKey });
      setResult({ ok: true, message: 'Connected successfully' });
      setTimeout(onSaved, 800);
    } catch (err) {
      setResult({ ok: false, message: err.response?.data?.detail || 'Connection failed' });
    } finally {
      setBusy(false);
    }
  }

  const stop = (e) => e.stopPropagation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={stop}>
        <div className="modal-header">
          <h2 className="modal-title">
            {meta.icon} Configure {meta.label}
          </h2>
          <button className="btn-icon" onClick={onClose} type="button">&#10005;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">URL</label>
              <input
                className="form-input"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="http://localhost:8100"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">{meta.credLabel}</label>
              <input
                className="form-input"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={meta.hint}
                autoComplete="off"
              />
            </div>
            {result && (
              <div className={`wizard-result ${result.ok ? 'ok' : 'err'}`}>
                {result.ok ? '✓ ' : '✗ '}{result.message}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Testing…' : 'Save & Test'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ServiceCard({ name, status, onRefresh }) {
  const meta    = SERVICE_META[name];
  const statusMeta = STATUS_LABELS[status.status] || STATUS_LABELS.not_configured;
  const [testing, setTesting]     = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      await api.post(`/services/${name}/test`);
    } catch {}
    finally { setTesting(false); onRefresh(); }
  }

  async function handleDisconnect() {
    if (!window.confirm(`Disconnect ${meta.label}? This removes saved credentials but does not stop containers.`)) return;
    setDisconnecting(true);
    try { await api.delete(`/services/${name}`); } catch {}
    finally { setDisconnecting(false); onRefresh(); }
  }

  return (
    <>
      {showConfig && (
        <ConfigureModal
          service={name}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); onRefresh(); }}
        />
      )}
      <div className="service-card">
        <div className="service-card-header">
          <span className="service-card-icon">{meta.icon}</span>
          <div className="service-card-title">
            <span className="service-card-name">{meta.label}</span>
            <span className={`service-status-badge ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          </div>
        </div>

        <div className="service-card-meta">
          {status.url && (
            <div className="service-card-url">{status.url}</div>
          )}
          <div className="service-card-tested">
            Last tested: {fmtDate(status.last_tested_at)}
            {status.last_test_status && status.status !== 'not_configured' && (
              <span className="service-card-test-msg"> — {status.last_test_status}</span>
            )}
          </div>
        </div>

        <div className="service-card-actions">
          {status.status !== 'not_configured' && (
            <button
              className="btn btn-secondary"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? 'Testing…' : 'Re-test'}
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => setShowConfig(true)}
          >
            {status.status === 'not_configured' ? 'Configure' : 'Reconfigure'}
          </button>
          {status.status !== 'not_configured' && (
            <button
              className="btn btn-secondary"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default function ServicesAdmin() {
  const [statuses, setStatuses]  = useState(null);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/services/status')
      .then(r => { setStatuses(r.data); setError(null); })
      .catch(() => setError('Failed to load service status.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">External Services</h1>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading && !statuses && (
        <div className="loading">Loading…</div>
      )}

      {statuses && (
        <div className="services-grid">
          {Object.entries(statuses).map(([name, status]) => (
            <ServiceCard
              key={name}
              name={name}
              status={status}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      <div className="services-help">
        <h3>About external services</h3>
        <p>
          RackSpares integrates with these optional services. Each can be connected
          to an existing instance or deployed fresh via the{' '}
          <strong>Setup Wizard</strong> (Admin → re-run wizard). Disconnecting a
          service only removes the saved credentials — it does not stop any containers.
        </p>
      </div>
    </div>
  );
}
