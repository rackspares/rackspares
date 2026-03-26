import React, { useEffect, useState } from 'react';
import api from '../api.jsx';
import { useTheme } from '../App.jsx';

const ACCENT_PRESETS = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#dc2626', // red
  '#ea580c', // orange
  '#ca8a04', // yellow
  '#16a34a', // green
  '#0891b2', // cyan
  '#475569', // slate
];

const THEMES = [
  { value: 'dark',   label: 'Dark',   icon: '🌙' },
  { value: 'light',  label: 'Light',  icon: '☀️' },
  { value: 'system', label: 'System', icon: '💻' },
];

export default function UserPreferences() {
  const { theme, accent, setTheme, setAccent } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Local form state (apply immediately, save on button)
  const [localTheme, setLocalTheme] = useState(theme);
  const [localAccent, setLocalAccent] = useState(accent);

  // Apply locally as the user plays with options
  useEffect(() => {
    setTheme(localTheme);
  }, [localTheme]);

  useEffect(() => {
    setAccent(localAccent);
  }, [localAccent]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/preferences/me', { theme: localTheme, accent_color: localAccent });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Preferences</h1>
          <p className="page-subtitle">Customize your theme and display settings</p>
        </div>
      </div>

      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ padding: 28, marginBottom: 24 }}>
          <h2 className="settings-section-title">Theme</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
            Choose how RackSpares looks. Changes apply immediately.
          </p>

          <div className="theme-options">
            {THEMES.map(t => (
              <div
                key={t.value}
                className={`theme-option ${localTheme === t.value ? 'active' : ''}`}
                onClick={() => setLocalTheme(t.value)}
              >
                <span className="theme-icon">{t.icon}</span>
                {t.label}
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 28, marginBottom: 24 }}>
          <h2 className="settings-section-title">Accent Color</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 18 }}>
            Choose a primary accent color for buttons and highlights.
          </p>

          <div className="accent-swatches">
            {ACCENT_PRESETS.map(c => (
              <div
                key={c}
                className={`accent-swatch ${localAccent === c ? 'active' : ''}`}
                style={{ background: c }}
                onClick={() => setLocalAccent(c)}
                title={c}
              />
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>Custom:</span>
              <input
                type="color"
                className="accent-custom"
                value={localAccent}
                onChange={e => setLocalAccent(e.target.value)}
                title="Pick custom color"
              />
            </div>
          </div>

          <div style={{
            marginTop: 18,
            padding: 14,
            borderRadius: 10,
            background: localAccent + '22',
            border: `2px solid ${localAccent}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: localAccent }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>Preview</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
                Accent: <code className="font-mono">{localAccent}</code>
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }}>
              Button preview
            </button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {saved && <div className="success-banner">Preferences saved successfully.</div>}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
        <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 10 }}>
          Theme changes are applied immediately. Click Save to persist across sessions.
        </div>
      </div>
    </div>
  );
}
