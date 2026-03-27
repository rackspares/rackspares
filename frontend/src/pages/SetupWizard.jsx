import React, { useRef, useState } from 'react';

const SERVICES = [
  {
    name:        'netbox',
    label:       'NetBox',
    icon:        '🔌',
    tagline:     'Network documentation & DCIM platform',
    description: 'NetBox is the source of truth for your network infrastructure — racks, devices, IPs, and cables. RackSpares uses it to browse rack layouts and clone rack configurations into inventory.',
    port:        8100,
    defaultUrl:  'http://localhost:8100',
    credLabel:   'API Token',
    credHint:    'Generate one in NetBox → Admin → API Tokens',
    deployNote:  'Deploys NetBox Community Edition with PostgreSQL and Redis on port 8100. A default admin account and API token are created automatically.',
  },
  {
    name:        'paperless',
    label:       'Paperless-ngx',
    icon:        '📄',
    tagline:     'Document management for receipts & warranties',
    description: 'Paperless-ngx indexes and OCRs scanned documents. Use it to attach purchase receipts, warranties, and datasheets directly to inventory items.',
    port:        8200,
    defaultUrl:  'http://localhost:8200',
    credLabel:   'API Token',
    credHint:    'Log in to Paperless → Settings → API Auth Tokens',
    deployNote:  'Deploys Paperless-ngx with PostgreSQL and Redis on port 8200. After it starts, log in and create an API token to finish connecting.',
  },
  {
    name:        'n8n',
    label:       'n8n',
    icon:        '🔄',
    tagline:     'Workflow automation & alerting',
    description: 'n8n lets you build automated workflows — reorder alerts to Slack, email notifications for low stock, or custom integrations with your procurement system.',
    port:        5678,
    defaultUrl:  'http://localhost:5678',
    credLabel:   'API Key',
    credHint:    'Log in to n8n → Settings → n8n API → Create API Key',
    deployNote:  'Deploys n8n on port 5678. Set up your account on first visit, then create an API key in Settings to connect.',
  },
];

const EMPTY_FORM = { url: '', api_key: '' };

export default function SetupWizard({ onComplete }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [choice, setChoice]   = useState(null);           // null | 'connect' | 'deploy'
  const [form, setForm]       = useState(EMPTY_FORM);
  const [busy, setBusy]       = useState(false);
  const [result, setResult]   = useState(null);           // { ok, message }
  const [deployLog, setDeployLog] = useState([]);
  const [deployDone, setDeployDone] = useState(false);
  const logRef  = useRef(null);
  const service = SERVICES[stepIdx];
  const isLast  = stepIdx === SERVICES.length - 1;

  // ── navigation ─────────────────────────────────────────────────────────────

  function advance() {
    if (isLast) {
      _markComplete();
      onComplete();
    } else {
      setStepIdx(i => i + 1);
      setChoice(null);
      setForm(EMPTY_FORM);
      setBusy(false);
      setResult(null);
      setDeployLog([]);
      setDeployDone(false);
    }
  }

  async function _markComplete() {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/services/wizard-complete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }

  async function handleSkip() {
    if (isLast) {
      await _markComplete();
      onComplete();
    } else {
      advance();
    }
  }

  async function handleDismiss() {
    await _markComplete();
    onComplete();
  }

  // ── connect form ────────────────────────────────────────────────────────────

  async function handleConnect(e) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/services/${service.name}/connect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: form.url, api_key: form.api_key }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setResult({ ok: true, message: data.message || 'Connected successfully' });
      } else {
        setResult({ ok: false, message: data.detail || 'Connection failed' });
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  // ── deploy ──────────────────────────────────────────────────────────────────

  async function handleDeploy() {
    setBusy(true);
    setDeployLog([]);
    setDeployDone(false);
    setResult(null);

    const token = localStorage.getItem('token');

    try {
      const resp = await fetch(`/api/services/${service.name}/deploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        const err = await resp.json();
        setResult({ ok: false, message: err.detail || 'Deploy failed' });
        setBusy(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const chunk of parts) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.line !== undefined) {
                setDeployLog(prev => {
                  const next = [...prev, ev.line];
                  setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 0);
                  return next;
                });
              }
              if (ev.error) {
                setResult({ ok: false, message: ev.error });
                setBusy(false);
              }
              if (ev.done) {
                setDeployDone(true);
                if (ev.exit_code === 0) {
                  // Auto-test after a brief startup delay
                  setTimeout(() => runAutoTest(), 8000);
                } else {
                  setResult({ ok: false, message: `docker compose exited with code ${ev.exit_code}` });
                  setBusy(false);
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setResult({ ok: false, message: err.message });
      setBusy(false);
    }
  }

  async function runAutoTest() {
    setDeployLog(prev => [...prev, '— Waiting for service to start… —']);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`/api/services/${service.name}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      setResult({ ok: data.ok, message: data.message });
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const canProceed = result?.ok || false;

  return (
    <div className="wizard-overlay">
      <div className="wizard-modal">

        {/* Header */}
        <div className="wizard-header">
          <div className="wizard-header-left">
            <span className="wizard-brand">RackSpares Setup Wizard</span>
          </div>
          <div className="wizard-steps">
            {SERVICES.map((s, i) => (
              <span
                key={s.name}
                className={`wizard-step-dot${i === stepIdx ? ' active' : ''}${i < stepIdx ? ' done' : ''}`}
                title={s.label}
              />
            ))}
          </div>
          <button className="wizard-dismiss" onClick={handleDismiss} title="Dismiss wizard">
            &#10005;
          </button>
        </div>

        {/* Service intro */}
        <div className="wizard-body">
          <div className="wizard-service-intro">
            <span className="wizard-service-icon">{service.icon}</span>
            <div>
              <div className="wizard-service-name">{service.label}</div>
              <div className="wizard-service-tagline">{service.tagline}</div>
            </div>
            <span className="wizard-step-counter">
              {stepIdx + 1} / {SERVICES.length}
            </span>
          </div>
          <p className="wizard-service-desc">{service.description}</p>

          {/* Choice buttons */}
          {!choice && (
            <div className="wizard-choices">
              <button
                className="wizard-choice"
                onClick={() => { setChoice('connect'); setForm({ ...EMPTY_FORM, url: service.defaultUrl }); }}
              >
                <span className="wizard-choice-icon">🔗</span>
                <strong>I already have one running</strong>
                <span>Enter the URL and API credentials to connect</span>
              </button>
              <button
                className="wizard-choice"
                onClick={() => setChoice('deploy')}
              >
                <span className="wizard-choice-icon">🚀</span>
                <strong>Spin one up for me</strong>
                <span>Deploy a fresh instance via Docker Compose</span>
              </button>
            </div>
          )}

          {/* Connect form */}
          {choice === 'connect' && (
            <form className="wizard-form" onSubmit={handleConnect}>
              <div className="form-group">
                <label className="form-label">URL</label>
                <input
                  className="form-input"
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder={service.defaultUrl}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{service.credLabel}</label>
                <input
                  className="form-input"
                  value={form.api_key}
                  onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
                  placeholder={service.credHint}
                  autoComplete="off"
                />
              </div>
              {result && (
                <div className={`wizard-result ${result.ok ? 'ok' : 'err'}`}>
                  {result.ok ? '✓ ' : '✗ '}{result.message}
                </div>
              )}
              <div className="wizard-form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => { setChoice(null); setResult(null); }}>
                  ← Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Testing…' : 'Test Connection'}
                </button>
              </div>
            </form>
          )}

          {/* Deploy panel */}
          {choice === 'deploy' && (
            <div className="wizard-deploy">
              <div className="wizard-deploy-note">
                <span className="wizard-deploy-note-icon">ℹ️</span>
                {service.deployNote}
              </div>
              {!busy && !deployDone && !result && (
                <button className="btn btn-primary wizard-deploy-btn" onClick={handleDeploy}>
                  Deploy {service.label}
                </button>
              )}
              {(deployLog.length > 0) && (
                <div className="wizard-log" ref={logRef}>
                  {deployLog.map((line, i) => (
                    <div key={i} className="wizard-log-line">{line || '\u00a0'}</div>
                  ))}
                </div>
              )}
              {busy && deployLog.length === 0 && (
                <div className="wizard-log-placeholder">Starting deployment…</div>
              )}
              {deployDone && !result && (
                <div className="wizard-log-placeholder">Testing connection…</div>
              )}
              {result && (
                <div className={`wizard-result ${result.ok ? 'ok' : 'err'}`}>
                  {result.ok ? '✓ ' : '✗ '}{result.message}
                  {result.ok && service.name !== 'netbox' && (
                    <div className="wizard-result-note">
                      Remember to create an API token in {service.label} and add it in Services settings.
                    </div>
                  )}
                </div>
              )}
              {!busy && (deployDone || result) && (
                <div className="wizard-form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => { setChoice(null); setResult(null); setDeployLog([]); setDeployDone(false); }}>
                    ← Back
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          <button className="btn btn-ghost" onClick={handleSkip}>
            Skip {service.label} for now
          </button>
          {(canProceed || choice === null) && choice !== null && (
            <button className="btn btn-primary" onClick={advance} disabled={!canProceed}>
              {isLast ? 'Finish Setup' : `Next: ${SERVICES[stepIdx + 1].label} →`}
            </button>
          )}
          {choice === null && (
            <button className="btn btn-primary" onClick={advance} style={{ visibility: 'hidden' }}>
              placeholder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
