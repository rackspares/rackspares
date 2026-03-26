import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

const STATUS_META = {
  draft:     { label: 'Draft',     cls: 'bom-status-badge bom-draft' },
  submitted: { label: 'Submitted', cls: 'bom-status-badge bom-submitted' },
  fulfilled: { label: 'Fulfilled', cls: 'bom-status-badge bom-fulfilled' },
};

export default function BOMDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [bom, setBom]             = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Item search
  const [search, setSearch]       = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer               = useRef(null);

  // Actions
  const [actionError, setActionError] = useState('');
  const [working, setWorking]     = useState(false);

  const fetchBom = async () => {
    try {
      const res = await api.get(`/boms/${id}`);
      setBom(res.data);
    } catch {
      setError('BOM not found.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBom(); }, [id]);

  // Search inventory items
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get('/inventory/', { params: { search } });
        setSearchResults(res.data.slice(0, 10));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const handleAddItem = async (inv) => {
    setActionError('');
    try {
      const res = await api.post(`/boms/${id}/items`, {
        inventory_item_id: inv.id,
        quantity_needed: 1,
      });
      setBom(res.data);
      setSearch('');
      setSearchResults([]);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to add item');
    }
  };

  const handleQtyChange = async (item, newQty) => {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 1) return;
    setActionError('');
    try {
      const res = await api.patch(`/boms/${id}/items/${item.id}`, { quantity_needed: qty });
      setBom(res.data);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to update quantity');
    }
  };

  const handleRemoveItem = async (item) => {
    setActionError('');
    try {
      const res = await api.delete(`/boms/${id}/items/${item.id}`);
      setBom(res.data);
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to remove item');
    }
  };

  const handleAction = async (action) => {
    setWorking(true);
    setActionError('');
    try {
      const res = await api.post(`/boms/${id}/${action}`);
      setBom(res.data);
    } catch (err) {
      setActionError(err.response?.data?.detail || `Action "${action}" failed`);
    } finally {
      setWorking(false);
    }
  };

  const handleExport = () => {
    const token = localStorage.getItem('token');
    const url = `/api/boms/${id}/export`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', '');
    // Use fetch to include auth header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const objUrl = URL.createObjectURL(blob);
        a.href = objUrl;
        a.click();
        URL.revokeObjectURL(objUrl);
      });
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error)   return (
    <main className="main-content">
      <div className="error-banner">{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/boms')}>← Back to BOMs</button>
    </main>
  );

  const isDraft     = bom.status === 'draft';
  const isSubmitted = bom.status === 'submitted';
  const meta        = STATUS_META[bom.status] || STATUS_META.draft;

  const totalNeeded  = bom.items.reduce((s, i) => s + i.quantity_needed, 0);
  const totalToOrder = bom.items.reduce((s, i) => s + i.quantity_to_order, 0);

  return (
    <main className="main-content">
      {/* Header */}
      <div style={{ marginBottom: 8 }}>
        <button
          className="btn btn-secondary"
          style={{ padding: '5px 12px', fontSize: 13, marginBottom: 12 }}
          onClick={() => navigate('/boms')}
        >
          ← BOMs
        </button>
      </div>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 className="page-title">{bom.name}</h1>
            <span className={meta.cls}>{meta.label}</span>
          </div>
          {bom.description && <p className="page-subtitle">{bom.description}</p>}
          <p className="page-subtitle">
            Created by {bom.creator_username || '—'} on {fmt(bom.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={handleExport}>&#8595; Export CSV</button>
          {canEdit && isDraft && (
            <button
              className="btn btn-primary"
              onClick={() => handleAction('submit')}
              disabled={working || bom.items.length === 0}
              title={bom.items.length === 0 ? 'Add items before submitting' : ''}
            >
              Submit BOM
            </button>
          )}
          {canEdit && isSubmitted && (
            <button
              className="btn btn-primary"
              onClick={() => handleAction('fulfill')}
              disabled={working}
            >
              Mark Fulfilled
            </button>
          )}
        </div>
      </div>

      {actionError && <div className="error-banner" style={{ marginBottom: 16 }}>{actionError}</div>}

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-label">Line Items</div>
          <div className="stat-value">{bom.items.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Needed</div>
          <div className="stat-value">{totalNeeded}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">To Order</div>
          <div className="stat-value" style={{ color: totalToOrder > 0 ? '#d97706' : '#16a34a' }}>
            {totalToOrder}
          </div>
        </div>
      </div>

      {/* Item search (draft only) */}
      {canEdit && isDraft && (
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <input
            type="search"
            className="search-input"
            style={{ width: '100%' }}
            placeholder="Search inventory to add items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(searchResults.length > 0 || searching) && (
            <div className="search-dropdown">
              {searching && <div className="search-dropdown-item" style={{ color: '#94a3b8' }}>Searching...</div>}
              {!searching && searchResults.map((inv) => (
                <div
                  key={inv.id}
                  className="search-dropdown-item"
                  onClick={() => handleAddItem(inv)}
                >
                  <div style={{ fontWeight: 600 }}>{inv.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {inv.category?.name || 'Uncategorized'} &bull; {inv.item_type} &bull; {inv.quantity} in stock
                  </div>
                </div>
              ))}
              {!searching && searchResults.length === 0 && search.trim() && (
                <div className="search-dropdown-item" style={{ color: '#94a3b8' }}>No items found</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Items table */}
      <div className="card">
        {bom.items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128203;</div>
            <div className="empty-title">No items yet</div>
            <div className="empty-text">
              {canEdit && isDraft ? 'Search for inventory items above to add them.' : 'This BOM has no items.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>In Stock</th>
                  <th>Needed</th>
                  <th>To Order</th>
                  {canEdit && isDraft && <th></th>}
                </tr>
              </thead>
              <tbody>
                {bom.items.map((item) => (
                  <tr key={item.id}>
                    <td><div className="col-name">{item.item_name || '?'}</div></td>
                    <td className="col-location">{item.item_category_name || '—'}</td>
                    <td>
                      {item.item_type && (
                        <span className={`item-type-badge item-type-${item.item_type}`}>
                          {item.item_type === 'consumable' ? 'Consumable' : 'Asset'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`qty${item.quantity_in_stock === 0 ? ' zero' : item.quantity_in_stock < 3 ? ' low' : ''}`}>
                        {item.quantity_in_stock}
                      </span>
                    </td>
                    <td>
                      {canEdit && isDraft ? (
                        <input
                          type="number"
                          min="1"
                          className="form-input"
                          style={{ width: 72, padding: '4px 8px' }}
                          defaultValue={item.quantity_needed}
                          onBlur={(e) => handleQtyChange(item, e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        />
                      ) : (
                        <span className="qty">{item.quantity_needed}</span>
                      )}
                    </td>
                    <td>
                      <span className={`qty${item.quantity_to_order > 0 ? ' low' : ''}`}>
                        {item.quantity_to_order}
                      </span>
                    </td>
                    {canEdit && isDraft && (
                      <td>
                        <button
                          className="btn-icon danger"
                          title="Remove"
                          onClick={() => handleRemoveItem(item)}
                        >
                          &#128465;
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bom.items.length > 0 && (
        <div className="table-footer">{bom.items.length} line item{bom.items.length !== 1 ? 's' : ''}</div>
      )}
    </main>
  );
}
