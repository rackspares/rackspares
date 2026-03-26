import React, { useEffect, useState } from 'react';
import api from '../api.jsx';

export default function Reorder() {
  const [alerts, setAlerts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get('/inventory/reorder')
      .then((res) => setAlerts(res.data))
      .catch(() => setError('Failed to load reorder alerts.'))
      .finally(() => setLoading(false));
  }, []);

  const criticalCount = alerts.filter((a) => a.urgency === 'critical').length;
  const warningCount  = alerts.filter((a) => a.urgency === 'warning').length;

  return (
    <main className="main-content">
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Alerts</div>
          <div className="stat-value" style={{ color: alerts.length > 0 ? '#dc2626' : '#0f172a' }}>
            {alerts.length}
          </div>
          <div className="stat-sub">below minimum</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Critical</div>
          <div className="stat-value" style={{ color: criticalCount > 0 ? '#dc2626' : '#0f172a' }}>
            {criticalCount}
          </div>
          <div className="stat-sub">zero stock</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Warning</div>
          <div className="stat-value" style={{ color: warningCount > 0 ? '#d97706' : '#0f172a' }}>
            {warningCount}
          </div>
          <div className="stat-sub">low stock</div>
        </div>
      </div>

      <div className="page-header">
        <div>
          <h1 className="page-title">Reorder Alerts</h1>
          <p className="page-subtitle">Consumables below minimum stock threshold</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 56, color: '#94a3b8' }}>Loading...</div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#9989;</div>
            <div className="empty-title">All stocked up</div>
            <div className="empty-text">No consumables are below their minimum stock threshold.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Urgency</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>In Stock</th>
                  <th>Minimum</th>
                  <th>Shortfall</th>
                  <th>Lead Time</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className={`urgency-badge urgency-${a.urgency}`}>
                        {a.urgency === 'critical' ? '● Critical' : '● Warning'}
                      </span>
                    </td>
                    <td>
                      <div className="col-name">{a.name}</div>
                      {a.description && <div className="col-desc">{a.description}</div>}
                    </td>
                    <td className="col-location">{a.category?.name || '—'}</td>
                    <td>
                      <span className={`qty${a.quantity === 0 ? ' zero' : ' low'}`}>{a.quantity}</span>
                    </td>
                    <td style={{ color: '#64748b' }}>{a.minimum_stock}</td>
                    <td>
                      <span className="qty zero">{a.shortfall}</span>
                    </td>
                    <td className="col-location">
                      {a.lead_time_days != null ? `${a.lead_time_days}d` : '—'}
                    </td>
                    <td className="col-location">{a.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="table-footer">{alerts.length} item{alerts.length !== 1 ? 's' : ''} need reordering</div>
      )}
    </main>
  );
}
