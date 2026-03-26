import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

export default function NetboxBrowse() {
  const [sites, setSites] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [racksFor, setRacksFor] = useState({});  // siteId → [rack]
  const [selectedRack, setSelectedRack] = useState(null);
  const [rackDevices, setRackDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    Promise.all([
      api.get('/netbox/sites'),
      api.get('/netbox/config').catch(() => null),
    ]).then(([sitesRes, cfgRes]) => {
      setSites(sitesRes.data);
      if (cfgRes) setSyncStatus(cfgRes.data);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleSite = async (siteId) => {
    const wasOpen = expanded[siteId];
    setExpanded(e => ({ ...e, [siteId]: !e[siteId] }));
    if (!wasOpen && !racksFor[siteId]) {
      try {
        const res = await api.get('/netbox/racks', { params: { site_id: siteId } });
        setRacksFor(r => ({ ...r, [siteId]: res.data }));
      } catch (e) {}
    }
  };

  const selectRack = async (rack) => {
    setSelectedRack(rack);
    setRackDevices([]);
    setLoadingDevices(true);
    try {
      const res = await api.get(`/netbox/racks/${rack.id}/devices`);
      setRackDevices(res.data);
    } catch (e) {}
    finally { setLoadingDevices(false); }
  };

  const fmtSync = (dt) => dt ? new Date(dt).toLocaleString() : 'Never';

  if (loading) return <div className="loading">Loading Netbox data…</div>;

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Netbox Browser</h1>
          <p className="page-subtitle">Read-only view of synced Netbox sites and racks</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {syncStatus?.last_sync_at && (
            <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
              Last sync: {fmtSync(syncStatus.last_sync_at)}
            </span>
          )}
          {isManagerOrAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/netbox/clone')}
            >
              Clone a Rack
            </button>
          )}
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">&#127760;</div>
            <div className="empty-title">No Netbox data synced yet</div>
            <div className="empty-text">
              Configure Netbox in{' '}
              {user?.role === 'admin'
                ? <a href="/netbox" style={{ color: 'var(--color-accent)' }}>Netbox Settings</a>
                : 'Settings (Admin only)'}
              {' '}then run a sync.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 24, gridTemplateColumns: selectedRack ? '1fr 1fr' : '1fr' }}>

          {/* Sites + Racks tree */}
          <div>
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))' }}>
              <div className="stat-card">
                <div className="stat-label">Sites</div>
                <div className="stat-value">{sites.length}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Racks</div>
                <div className="stat-value">{sites.reduce((a, s) => a + s.rack_count, 0)}</div>
              </div>
            </div>

            <div className="card">
              {sites.map(site => (
                <div key={site.id} className="site-row">
                  <div className="site-row-header" onClick={() => toggleSite(site.id)}>
                    <span className="site-expand-icon">{expanded[site.id] ? '▼' : '▶'}</span>
                    <span className="site-name">{site.name}</span>
                    {site.description && (
                      <span style={{ fontSize: 12, color: 'var(--color-text-faint)', marginLeft: 8 }}>
                        {site.description}
                      </span>
                    )}
                    <span className="site-rack-count">{site.rack_count} racks</span>
                  </div>

                  {expanded[site.id] && (
                    <div className="rack-list">
                      {!racksFor[site.id] ? (
                        <div style={{ fontSize: 13, color: 'var(--color-text-faint)', padding: '8px 0' }}>
                          Loading…
                        </div>
                      ) : racksFor[site.id].length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--color-text-faint)', padding: '8px 0' }}>
                          No racks at this site
                        </div>
                      ) : racksFor[site.id].map(rack => (
                        <div
                          key={rack.id}
                          className="rack-item"
                          style={{ background: selectedRack?.id === rack.id ? 'var(--color-accent-faint)' : undefined }}
                          onClick={() => selectRack(rack)}
                        >
                          <span style={{ fontSize: 16 }}>&#128451;</span>
                          <span className="rack-item-name">{rack.name}</span>
                          {rack.location && (
                            <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
                              {rack.location}
                            </span>
                          )}
                          <span className="rack-item-meta">
                            {rack.u_height}U &bull; {rack.device_count} devices
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rack device list */}
          {selectedRack && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>
                    {selectedRack.name}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--color-text-faint)', marginTop: 2 }}>
                    {selectedRack.site_name} &bull; {selectedRack.u_height}U &bull; {rackDevices.length} devices
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isManagerOrAdmin && (
                    <button
                      className="btn btn-primary"
                      onClick={() => navigate(`/netbox/clone?rack_id=${selectedRack.id}`)}
                      style={{ fontSize: 13 }}
                    >
                      Clone this Rack
                    </button>
                  )}
                  <button className="btn btn-secondary" onClick={() => setSelectedRack(null)}>
                    ✕
                  </button>
                </div>
              </div>

              <div className="card">
                {loadingDevices ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                    Loading devices…
                  </div>
                ) : rackDevices.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">&#128260;</div>
                    <div className="empty-title">No devices in this rack</div>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>U</th>
                          <th>Name</th>
                          <th>Device Type</th>
                          <th>Role</th>
                          <th>Face</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rackDevices.map(d => (
                          <tr key={d.id}>
                            <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-faint)', fontSize: 13 }}>
                              {d.position != null ? d.position : '—'}
                            </td>
                            <td className="col-name">{d.name || '—'}</td>
                            <td>
                              {d.device_type_model ? (
                                <div>
                                  <div style={{ fontSize: 13 }}>{d.device_type_model}</div>
                                  {d.device_type_manufacturer && (
                                    <div style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                                      {d.device_type_manufacturer}
                                    </div>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="col-location">{d.role || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>{d.face || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
