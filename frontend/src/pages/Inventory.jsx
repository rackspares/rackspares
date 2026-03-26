import React, { useEffect, useState } from 'react';
import api from '../api.jsx';
import { useAuth } from '../App.jsx';
import InventoryForm from '../components/InventoryForm.jsx';
import StatusBadge from '../components/StatusBadge.jsx';

const CATEGORIES = [
  'Server', 'Network', 'Storage', 'Power',
  'Cooling', 'Cable', 'Accessory', 'Other',
];

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function staleness(lastVerified) {
  if (!lastVerified) return 'red';
  const days = (Date.now() - new Date(lastVerified).getTime()) / 86400000;
  if (days >= 90) return 'red';
  if (days >= 30) return 'amber';
  return null;
}

function VerifiedCell({ lastVerified, onVerify, verifying }) {
  const stale = staleness(lastVerified);
  return (
    <div className="verified-cell">
      <span className={stale ? `stale-badge stale-${stale}` : 'stale-badge stale-ok'}>
        {stale === 'red' ? '●' : stale === 'amber' ? '●' : '✓'}&nbsp;
        {lastVerified ? fmt(lastVerified) : 'Never'}
      </span>
      <button
        className="btn-icon verify-btn"
        title="Verify Stock"
        onClick={onVerify}
        disabled={verifying}
      >
        &#10003;
      </button>
    </div>
  );
}

function ConfirmDialog({ itemName, onConfirm, onCancel, deleting }) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-dialog">
        <div className="confirm-title">Delete item?</div>
        <div className="confirm-text">
          <strong>{itemName}</strong> will be permanently removed from inventory.
          This cannot be undone.
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button className="btn btn-danger-outline" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { user } = useAuth();
  const role = user?.role;
  const canEdit = role === 'admin' || role === 'manager';

  const [items, setItems]               = useState([]);
  const [fetching, setFetching]         = useState(true);
  const [search, setSearch]             = useState('');
  const [categoryFilter, setCategory]   = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [staleFilter, setStale]         = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [saving, setSaving]             = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [verifying, setVerifying]       = useState(null); // item id being verified

  useEffect(() => {
    let cancelled = false;
    const delay = search ? 300 : 0;

    const timer = setTimeout(async () => {
      setFetching(true);
      try {
        const params = {};
        if (search)         params.search   = search;
        if (categoryFilter) params.category = categoryFilter;
        if (statusFilter)   params.status   = statusFilter;
        if (staleFilter)    params.stale    = staleFilter;
        const res = await api.get('/inventory/', { params });
        if (!cancelled) setItems(res.data);
      } catch (err) {
        console.error('Failed to fetch inventory', err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    }, delay);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, categoryFilter, statusFilter, staleFilter]);

  const refresh = () => setSearch((s) => s);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/inventory/${editItem.id}`, formData);
      } else {
        await api.post('/inventory/', formData);
      }
      setShowForm(false);
      setEditItem(null);
      refresh();
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/inventory/${deleteTarget.id}`);
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      console.error('Delete failed', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleVerify = async (item) => {
    setVerifying(item.id);
    try {
      const res = await api.patch(`/inventory/${item.id}/verify`);
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data : i)));
    } catch (err) {
      console.error('Verify failed', err);
    } finally {
      setVerifying(null);
    }
  };

  const openAdd  = () => { setEditItem(null); setShowForm(true); };
  const openEdit = (item) => { setEditItem(item); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditItem(null); };

  const isFiltered = search || categoryFilter || statusFilter || staleFilter;

  const totalQty       = items.reduce((s, i) => s + i.quantity, 0);
  const availableCount = items.filter((i) => i.status === 'available').length;
  const faultyCount    = items.filter((i) => i.status === 'faulty').length;
  const staleCount     = items.filter((i) => staleness(i.last_verified) !== null).length;

  return (
    <main className="main-content">
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Items</div>
          <div className="stat-value">{items.length}</div>
          <div className="stat-sub">unique SKUs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Qty</div>
          <div className="stat-value">{totalQty}</div>
          <div className="stat-sub">units on hand</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Available</div>
          <div className="stat-value" style={{ color: '#16a34a' }}>{availableCount}</div>
          <div className="stat-sub">ready to use</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Faulty</div>
          <div className="stat-value" style={{ color: faultyCount > 0 ? '#dc2626' : '#0f172a' }}>
            {faultyCount}
          </div>
          <div className="stat-sub">need attention</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stale</div>
          <div className="stat-value" style={{ color: staleCount > 0 ? '#d97706' : '#0f172a' }}>
            {staleCount}
          </div>
          <div className="stat-sub">unverified 30d+</div>
        </div>
      </div>

      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">{isFiltered ? 'Filtered results' : 'All items'}</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={openAdd}>
            + Add Item
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="filters-bar">
        <input
          type="search"
          className="search-input"
          placeholder="Search by name, description, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="filter-select" value={categoryFilter} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="in_use">In Use</option>
          <option value="faulty">Faulty</option>
          <option value="retired">Retired</option>
        </select>
        <select className="filter-select" value={staleFilter} onChange={(e) => setStale(e.target.value)}>
          <option value="">All Verified</option>
          <option value="any">Stale (30d+)</option>
          <option value="red">Critical (90d+)</option>
        </select>
        {isFiltered && (
          <button className="btn btn-secondary" onClick={() => {
            setSearch(''); setCategory(''); setStatus(''); setStale('');
          }}>
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        {fetching ? (
          <div style={{ textAlign: 'center', padding: '56px', color: '#94a3b8' }}>Loading...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128230;</div>
            <div className="empty-title">No items found</div>
            <div className="empty-text">
              {isFiltered ? 'Try adjusting your search or filters.' : 'Add your first inventory item to get started.'}
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Last Verified</th>
                  <th>Date Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="col-name">{item.name}</div>
                      {item.description && <div className="col-desc">{item.description}</div>}
                    </td>
                    <td>{item.category}</td>
                    <td>
                      <span className={`qty${item.quantity === 0 ? ' zero' : item.quantity < 3 ? ' low' : ''}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="col-location">{item.location || '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td>
                      <VerifiedCell
                        lastVerified={item.last_verified}
                        onVerify={() => handleVerify(item)}
                        verifying={verifying === item.id}
                      />
                    </td>
                    <td className="col-date">{fmt(item.date_added)}</td>
                    <td>
                      <div className="col-actions">
                        {canEdit && (
                          <>
                            <button className="btn-icon" title="Edit" onClick={() => openEdit(item)}>
                              &#9998;
                            </button>
                            <button className="btn-icon danger" title="Delete" onClick={() => setDeleteTarget(item)}>
                              &#128465;
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="table-footer">{items.length} item{items.length !== 1 ? 's' : ''}</div>
      )}

      {showForm && (
        <InventoryForm item={editItem} onSave={handleSave} onClose={closeForm} saving={saving} />
      )}

      {deleteTarget && (
        <ConfirmDialog
          itemName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </main>
  );
}
