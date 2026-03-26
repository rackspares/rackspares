import React, { useEffect, useState } from 'react';
import api from '../api.jsx';

const ACTION_COLORS = {
  create: { bg: '#dcfce7', color: '#16a34a' },
  update: { bg: '#fef3c7', color: '#b45309' },
  delete: { bg: '#fee2e2', color: '#dc2626' },
};

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ChangesSummary({ changes, action }) {
  if (!changes) return <span style={{ color: '#94a3b8' }}>—</span>;

  if (action === 'create' || action === 'delete') {
    const entries = Object.entries(changes).filter(([, v]) => v != null && v !== '');
    return (
      <span style={{ fontSize: 12, color: '#64748b' }}>
        {entries.slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ')}
        {entries.length > 3 && ` +${entries.length - 3} more`}
      </span>
    );
  }

  // update: {field: {old, new}}
  const diffs = Object.entries(changes);
  return (
    <span style={{ fontSize: 12, color: '#64748b' }}>
      {diffs.slice(0, 2).map(([k, v]) => `${k}: ${v.old ?? '∅'} → ${v.new ?? '∅'}`).join('; ')}
      {diffs.length > 2 && ` +${diffs.length - 2} more`}
    </span>
  );
}

export default function AuditLog() {
  const [logs, setLogs]         = useState([]);
  const [fetching, setFetching] = useState(true);
  const [username, setUsername] = useState('');
  const [action, setAction]     = useState('');
  const [startDate, setStart]   = useState('');
  const [endDate, setEnd]       = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    let cancelled = false;
    const delay = username ? 300 : 0;

    const timer = setTimeout(async () => {
      setFetching(true);
      setError('');
      try {
        const params = { limit: 200 };
        if (username)  params.username   = username;
        if (action)    params.action     = action;
        if (startDate) params.start_date = new Date(startDate).toISOString();
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          params.end_date = end.toISOString();
        }
        const res = await api.get('/audit/', { params });
        if (!cancelled) setLogs(res.data);
      } catch (err) {
        if (!cancelled) setError('Failed to load audit log');
      } finally {
        if (!cancelled) setFetching(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [username, action, startDate, endDate]);

  const isFiltered = username || action || startDate || endDate;

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-subtitle">All inventory changes with full history</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="filters-bar">
        <input
          type="search"
          className="search-input"
          placeholder="Filter by username..."
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ maxWidth: 220 }}
        />
        <select className="filter-select" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
        <input
          type="date"
          className="filter-select"
          value={startDate}
          onChange={(e) => setStart(e.target.value)}
          title="Start date"
        />
        <input
          type="date"
          className="filter-select"
          value={endDate}
          onChange={(e) => setEnd(e.target.value)}
          title="End date"
        />
        {isFiltered && (
          <button className="btn btn-secondary" onClick={() => {
            setUsername(''); setAction(''); setStart(''); setEnd('');
          }}>
            Clear
          </button>
        )}
      </div>

      <div className="card">
        {fetching ? (
          <div style={{ textAlign: 'center', padding: '56px', color: '#94a3b8' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128196;</div>
            <div className="empty-title">No log entries</div>
            <div className="empty-text">
              {isFiltered ? 'No entries match your filters.' : 'Audit entries will appear here after inventory changes.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Item</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const ac = ACTION_COLORS[log.action] || {};
                  return (
                    <tr key={log.id}>
                      <td className="col-date" style={{ whiteSpace: 'nowrap' }}>{fmt(log.timestamp)}</td>
                      <td style={{ fontWeight: 500 }}>{log.username ?? <span style={{ color: '#94a3b8' }}>deleted</span>}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 9px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 600,
                          background: ac.bg,
                          color: ac.color,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span className="col-name">{log.entity_name ?? '—'}</span>
                        {log.entity_id && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: '#94a3b8' }}>#{log.entity_id}</span>
                        )}
                      </td>
                      <td><ChangesSummary changes={log.changes} action={log.action} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <div className="table-footer">{logs.length} entr{logs.length !== 1 ? 'ies' : 'y'}</div>
      )}
    </main>
  );
}
