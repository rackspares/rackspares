import React, { useEffect, useState } from 'react';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

function staleness(lastVerified) {
  if (!lastVerified) return true;
  const days = (Date.now() - new Date(lastVerified).getTime()) / 86400000;
  return days >= 30;
}

export default function AdminTicker() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.role !== 'admin') return;

    let cancelled = false;

    async function load() {
      try {
        const [invRes, reorderRes] = await Promise.all([
          api.get('/inventory/'),
          api.get('/inventory/reorder'),
        ]);
        if (cancelled) return;

        const items = invRes.data;
        const alerts = reorderRes.data;

        const totalQty       = items.reduce((s, i) => s + i.quantity, 0);
        const availableCount = items.filter(i => i.status === 'available').length;
        const faultyCount    = items.filter(i => i.status === 'faulty').length;
        const staleCount     = items.filter(i => staleness(i.last_verified)).length;
        const criticalCount  = alerts.filter(a => a.urgency === 'critical').length;

        setStats({
          skus: items.length,
          totalQty,
          availableCount,
          faultyCount,
          staleCount,
          reorderAlerts: alerts.length,
          criticalCount,
        });
      } catch {
        // silently ignore — ticker is non-critical
      }
    }

    load();
    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  if (user?.role !== 'admin' || !stats) return null;

  const segments = [
    { label: 'SKUs',     value: stats.skus,           color: null },
    { label: 'UNITS',    value: stats.totalQty,        color: null },
    { label: 'AVAIL',    value: stats.availableCount,  color: '#22c55e' },
    { label: 'FAULTY',   value: stats.faultyCount,     color: stats.faultyCount > 0 ? '#f87171' : '#4ade80' },
    { label: 'STALE',    value: stats.staleCount,      color: stats.staleCount > 0 ? '#fbbf24' : '#4ade80' },
    { label: 'REORDER',  value: stats.reorderAlerts,   color: stats.reorderAlerts > 0 ? '#f87171' : '#4ade80' },
    { label: 'CRITICAL', value: stats.criticalCount,   color: stats.criticalCount > 0 ? '#f87171' : '#4ade80' },
  ];

  // Repeat enough times to ensure seamless loop
  const items = [...segments, ...segments, ...segments];

  return (
    <div className="ticker-bar" aria-label="Admin inventory ticker">
      <span className="ticker-label">LIVE</span>
      <div className="ticker-track-wrapper">
        <div className="ticker-track">
          {items.map((seg, i) => (
            <span key={i} className="ticker-segment">
              <span className="ticker-key">{seg.label}</span>
              <span
                className="ticker-val"
                style={seg.color ? { color: seg.color } : undefined}
              >
                {seg.value}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
