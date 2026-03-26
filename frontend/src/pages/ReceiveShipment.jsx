import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import api from '../api.jsx';

const STEPS = ['scan', 'review', 'confirm', 'done'];

const EMPTY_FORM = {
  name: '',
  serial_number: '',
  quantity: 1,
  location: '',
  description: '',
  category_id: '',
  status: 'available',
  item_type: 'asset',
};

function buildCategoryTree(flat) {
  const map = {};
  flat.forEach((c) => (map[c.id] = { ...c, children: [] }));
  const roots = [];
  flat.forEach((c) => {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

function CategoryOptions({ nodes, depth = 0 }) {
  return nodes.map((node) => (
    <React.Fragment key={node.id}>
      <option value={node.id}>{'  '.repeat(depth)}{depth > 0 ? '↳ ' : ''}{node.name}</option>
      {node.children.length > 0 && <CategoryOptions nodes={node.children} depth={depth + 1} />}
    </React.Fragment>
  ));
}

export default function ReceiveShipment() {
  const navigate = useNavigate();
  const [step, setStep] = useState('scan');
  const [scannedCode, setScannedCode] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedItem, setSavedItem] = useState(null);
  const [scanKey, setScanKey] = useState(0);   // remount scanner on retry
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const manualRef = useRef(null);

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const categoryTree = buildCategoryTree(categories);

  // ── scan handling ──────────────────────────────────────────────────────────

  async function handleScan(code) {
    setScannedCode(code);
    setStep('review');

    // Try barcode lookup
    try {
      const res = await api.get('/inventory/barcode-lookup', { params: { code } });
      if (res.data.found) {
        setLookupResult(res.data);
        setForm((f) => ({
          ...f,
          name:        res.data.name        || f.name,
          description: res.data.description || f.description,
        }));
      } else {
        setLookupResult({ found: false });
      }
    } catch {
      setLookupResult({ found: false });
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setShowManual(false);
    setManualCode('');
    handleScan(code);
  }

  // ── form helpers ───────────────────────────────────────────────────────────

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (Number(form.quantity) < 1) e.quantity = 'Quantity must be at least 1';
    return e;
  }

  // ── confirm / save ─────────────────────────────────────────────────────────

  async function handleConfirm(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setErrors({});

    const payload = {
      name:          form.name.trim(),
      serial_number: form.serial_number.trim() || null,
      quantity:      Number(form.quantity),
      location:      form.location.trim() || null,
      description:   form.description.trim() || null,
      category_id:   form.category_id !== '' ? Number(form.category_id) : null,
      status:        form.status,
      item_type:     form.item_type,
    };

    try {
      // Check if an item with this serial number already exists
      if (payload.serial_number) {
        try {
          const search = await api.get('/inventory/', { params: { search: payload.serial_number } });
          const existing = search.data.find(
            (it) => it.serial_number === payload.serial_number
          );
          if (existing) {
            // Update existing item's quantity
            const updated = await api.put(`/inventory/${existing.id}`, {
              quantity: existing.quantity + payload.quantity,
              location: payload.location ?? existing.location,
            });
            setSavedItem({ ...updated.data, _wasUpdated: true });
            setStep('done');
            return;
          }
        } catch {}
      }

      const res = await api.post('/inventory/', payload);
      setSavedItem(res.data);
      setStep('done');
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'string' && detail.toLowerCase().includes('serial')) {
        setErrors({ serial_number: detail });
      } else {
        setErrors({ _general: detail || 'Failed to save item. Please try again.' });
      }
    } finally {
      setSaving(false);
    }
  }

  // ── reset for next scan ────────────────────────────────────────────────────

  function reset() {
    setStep('scan');
    setScannedCode('');
    setLookupResult(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setSavedItem(null);
    setScanKey((k) => k + 1);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="receive-page">
      <div className="receive-header">
        <button className="btn btn-ghost receive-back" onClick={() => navigate('/')}>
          &#8592; Back
        </button>
        <h1 className="receive-title">Receive Shipment</h1>
        <div className="receive-steps">
          {STEPS.filter(s => s !== 'done').map((s, i) => (
            <span
              key={s}
              className={`receive-step${step === s ? ' active' : ''}${STEPS.indexOf(step) > i ? ' done' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
          ))}
        </div>
      </div>

      {/* ── STEP: scan ── */}
      {step === 'scan' && (
        <div className="receive-body">
          <BarcodeScanner key={scanKey} onScan={handleScan} />

          <div className="receive-manual-toggle">
            {showManual ? (
              <form className="receive-manual-form" onSubmit={handleManualSubmit}>
                <input
                  ref={manualRef}
                  className="form-input receive-manual-input"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter barcode / serial number"
                  autoFocus
                />
                <button type="submit" className="btn btn-primary">Look up</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowManual(false)}>Cancel</button>
              </form>
            ) : (
              <button className="btn btn-secondary" onClick={() => setShowManual(true)}>
                Enter code manually
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP: review ── */}
      {step === 'review' && (
        <div className="receive-body">
          {lookupResult === null && (
            <div className="receive-lookup-status">Looking up barcode…</div>
          )}
          {lookupResult?.found && (
            <div className="receive-lookup-badge found">
              Product found — fields pre-filled from barcode database
            </div>
          )}
          {lookupResult?.found === false && (
            <div className="receive-lookup-badge not-found">
              No product match — enter details below
            </div>
          )}

          <form className="receive-form" onSubmit={handleConfirm}>
            <div className="form-grid">
              {errors._general && (
                <div className="form-error form-col-span">{errors._general}</div>
              )}

              <div className="form-group form-col-span">
                <label className="form-label">Name *</label>
                <input
                  className={`form-input${errors.name ? ' has-error' : ''}`}
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Dell PowerEdge R740"
                  autoFocus
                />
                {errors.name && <div className="form-error">{errors.name}</div>}
              </div>

              <div className="form-group form-col-span">
                <label className="form-label">Serial Number</label>
                <input
                  className={`form-input${errors.serial_number ? ' has-error' : ''}`}
                  value={form.serial_number}
                  onChange={(e) => set('serial_number', e.target.value)}
                  placeholder={scannedCode || 'e.g. SN-ABC123'}
                />
                {errors.serial_number && <div className="form-error">{errors.serial_number}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Quantity *</label>
                <input
                  type="number"
                  min="1"
                  className={`form-input${errors.quantity ? ' has-error' : ''}`}
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                />
                {errors.quantity && <div className="form-error">{errors.quantity}</div>}
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="e.g. Rack A3, Shelf 2"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-input"
                  value={form.category_id}
                  onChange={(e) => set('category_id', e.target.value)}
                >
                  <option value="">— None —</option>
                  <CategoryOptions nodes={categoryTree} />
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-input"
                  value={form.item_type}
                  onChange={(e) => set('item_type', e.target.value)}
                >
                  <option value="asset">Asset</option>
                  <option value="consumable">Consumable</option>
                </select>
              </div>

              <div className="form-group form-col-span">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>
            </div>

            <div className="receive-form-actions">
              <button type="button" className="btn btn-secondary" onClick={reset}>
                &#8592; Re-scan
              </button>
              <button type="submit" className="btn btn-primary receive-confirm-btn" disabled={saving}>
                {saving ? 'Saving…' : 'Confirm Receipt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP: done ── */}
      {step === 'done' && savedItem && (
        <div className="receive-body receive-done">
          <div className="receive-done-icon">&#10003;</div>
          <h2 className="receive-done-title">
            {savedItem._wasUpdated ? 'Stock Updated' : 'Item Received'}
          </h2>
          <div className="receive-done-name">{savedItem.name}</div>
          <div className="receive-done-meta">
            {savedItem.serial_number && (
              <span>S/N: {savedItem.serial_number}</span>
            )}
            <span>Qty: {savedItem.quantity}</span>
            {savedItem.location && <span>Location: {savedItem.location}</span>}
          </div>
          {savedItem._wasUpdated && (
            <div className="receive-done-note">
              Existing item found by serial number — quantity incremented.
            </div>
          )}
          <div className="receive-done-actions">
            <button className="btn btn-primary" onClick={reset}>
              Scan Another
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              Go to Inventory
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
