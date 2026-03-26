import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api.jsx';

const COMPAT_LABEL = { confirmed: 'Compatible', unverified: 'Unverified', incompatible: 'Incompatible' };

export default function CloneARack() {
  const [sites, setSites] = useState([]);
  const [racks, setRacks] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedRackId, setSelectedRackId] = useState('');
  const [destSite, setDestSite] = useState('');
  const [createBom, setCreateBom] = useState(false);
  const [bomName, setBomName] = useState('');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    api.get('/netbox/sites').then(res => {
      setSites(res.data);
      // Pre-select from query param
      const preRackId = searchParams.get('rack_id');
      if (preRackId) {
        setSelectedRackId(preRackId);
        api.get('/netbox/racks').then(r => {
          setRacks(r.data);
          const rack = r.data.find(ra => String(ra.id) === preRackId);
          if (rack?.site_id) setSelectedSiteId(String(rack.site_id));
        });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedSiteId) {
      setRacks([]);
      setSelectedRackId('');
      return;
    }
    api.get('/netbox/racks', { params: { site_id: selectedSiteId } })
      .then(res => setRacks(res.data))
      .catch(() => {});
  }, [selectedSiteId]);

  // Update default BOM name when rack changes
  useEffect(() => {
    const rack = racks.find(r => String(r.id) === selectedRackId);
    if (rack) setBomName(`Clone: ${rack.name}`);
  }, [selectedRackId, racks]);

  const handleRun = async () => {
    if (!selectedRackId) return;
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await api.post('/netbox/clone-rack', {
        netbox_rack_id: Number(selectedRackId),
        destination_site: destSite.trim() || null,
        create_bom: createBom,
        bom_name: createBom ? bomName : null,
      });
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Clone failed');
    } finally {
      setRunning(false);
    }
  };

  const toOrderItems = result?.line_items.filter(i => i.quantity_to_order > 0) || [];
  const allCovered = result && toOrderItems.length === 0;
  const opticWarnings = result?.line_items.filter(i => i.optic_flags?.length > 0) || [];

  return (
    <div className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clone-a-Rack</h1>
          <p className="page-subtitle">Generate a parts list from a Netbox rack and diff against current inventory</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(360px,1fr))' }}>

        {/* ── Controls ── */}
        <div className="card" style={{ padding: 24 }}>
          <h2 className="settings-section-title">Source Rack</h2>

          <div className="form-group">
            <label className="form-label">Site</label>
            <select
              className="form-input filter-select"
              value={selectedSiteId}
              onChange={e => setSelectedSiteId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">— All sites —</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Rack</label>
            <select
              className="form-input filter-select"
              value={selectedRackId}
              onChange={e => setSelectedRackId(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">— Select rack —</option>
              {racks.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.location ? ` (${r.location})` : ''} — {r.device_count} devices
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Destination Site / Platform (for optic checks)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Cisco, Arista, DC-LON1 …"
              value={destSite}
              onChange={e => setDestSite(e.target.value)}
            />
          </div>

          <h2 className="settings-section-title" style={{ marginTop: 24 }}>BOM Generation</h2>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--color-text)', fontSize: 14, marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={createBom}
              onChange={e => setCreateBom(e.target.checked)}
            />
            Auto-create BOM from shortfall items
          </label>

          {createBom && (
            <div className="form-group">
              <label className="form-label">BOM Name</label>
              <input
                type="text"
                className="form-input"
                value={bomName}
                onChange={e => setBomName(e.target.value)}
              />
            </div>
          )}

          {error && <div className="error-banner">{error}</div>}

          <button
            className="btn btn-primary btn-full"
            onClick={handleRun}
            disabled={running || !selectedRackId}
            style={{ marginTop: 8 }}
          >
            {running ? 'Generating…' : 'Generate Parts List'}
          </button>
        </div>

        {/* ── Quick stats (after run) ── */}
        {result && (
          <div>
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))' }}>
              <div className="stat-card">
                <div className="stat-label">Device Types</div>
                <div className="stat-value">{result.total_device_types}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">To Order</div>
                <div className="stat-value" style={{ color: toOrderItems.length ? 'var(--color-danger)' : 'var(--color-success-text)' }}>
                  {toOrderItems.length}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Optic Flags</div>
                <div className="stat-value" style={{ color: opticWarnings.length ? 'var(--color-warn-text)' : 'var(--color-text-faint)' }}>
                  {opticWarnings.length}
                </div>
              </div>
            </div>

            {result.bom_id && (
              <div className="success-banner">
                BOM created: <strong>{result.bom_name}</strong>{' '}
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 10px', fontSize: 12, marginLeft: 8 }}
                  onClick={() => navigate(`/boms/${result.bom_id}`)}
                >
                  Open BOM →
                </button>
              </div>
            )}

            {allCovered && (
              <div className="success-banner">
                All items fully covered by current inventory — nothing to order!
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Results table ── */}
      {result && (
        <div style={{ marginTop: 24 }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)' }}>
              Parts List — {result.rack_name}
              {result.site_name && <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: 14 }}> / {result.site_name}</span>}
              {result.destination_site && (
                <span style={{ fontWeight: 400, color: 'var(--color-text-faint)', fontSize: 14 }}> → {result.destination_site}</span>
              )}
            </h2>
          </div>

          <div className="card">
            <div className="table-wrapper">
              <table className="clone-rack-table">
                <thead>
                  <tr>
                    <th>Device Type</th>
                    <th>Manufacturer</th>
                    <th>Category</th>
                    <th>Matched Item</th>
                    <th>Needed</th>
                    <th>In Stock</th>
                    <th>To Order</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {result.line_items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="col-name">{item.device_type_model}</td>
                      <td className="col-location">{item.device_type_manufacturer || '—'}</td>
                      <td className="col-location">{item.inventory_category_name || <span style={{ color: 'var(--color-text-faint)' }}>Unmapped</span>}</td>
                      <td>
                        {item.matched_inventory_item_name
                          ? <span style={{ fontSize: 13 }}>{item.matched_inventory_item_name}</span>
                          : <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>No match</span>
                        }
                      </td>
                      <td className="col-needed" style={{ textAlign: 'center' }}>{item.quantity_needed}</td>
                      <td className="col-instock" style={{ textAlign: 'center' }}>
                        <span className={`qty${item.quantity_in_stock === 0 ? ' zero' : item.quantity_in_stock < item.quantity_needed ? ' low' : ''}`}>
                          {item.quantity_in_stock}
                        </span>
                      </td>
                      <td
                        className={`col-toorder ${item.quantity_to_order === 0 ? 'zero' : 'nonzero'}`}
                        style={{ textAlign: 'center' }}
                      >
                        {item.quantity_to_order}
                      </td>
                      <td>
                        {item.optic_flags?.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {item.optic_flags.map((f, fi) => (
                              <span key={fi} className={`optic-flag ${f.level}`}>
                                {f.level === 'incompatible' ? '✗' : f.level === 'confirmed' ? '✓' : '?'} {f.message}
                              </span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
