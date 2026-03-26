import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import api from '../api.jsx';

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

function formToPayload(form) {
  return {
    name:          form.name.trim(),
    serial_number: form.serial_number.trim() || null,
    quantity:      Number(form.quantity),
    location:      form.location.trim() || null,
    description:   form.description.trim() || null,
    category_id:   form.category_id !== '' ? Number(form.category_id) : null,
    status:        form.status,
    item_type:     form.item_type,
  };
}

export default function ReceiveShipment() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('single');          // 'single' | 'bulk'
  const [step, setStep] = useState('scan');            // 'scan' | 'review' | 'done'
  const [scannedCode, setScannedCode] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedItem, setSavedItem] = useState(null);    // single mode done
  const [bulkResult, setBulkResult] = useState(null);  // bulk mode done
  const [stagingList, setStagingList] = useState([]);  // bulk staging
  const [scanKey, setScanKey] = useState(0);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [ocrLines, setOcrLines] = useState([]);       // text extracted from uploaded photo

  useEffect(() => {
    api.get('/categories/').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  const categoryTree = buildCategoryTree(categories);

  // ── mode switch ────────────────────────────────────────────────────────────

  function switchMode(m) {
    setMode(m);
    resetScan();
    if (m === 'single') setStagingList([]);
  }

  // ── scan handling ──────────────────────────────────────────────────────────

  // Called by BarcodeScanner when OCR text is extracted from an uploaded photo.
  // If we're still on the scan step (no barcode found), move to review with OCR data.
  function handleTextFound(lines) {
    setOcrLines(lines);
    if (step === 'scan') {
      // No barcode was found — go to review with OCR text as the only source
      setStep('review');
      setLookupResult({ found: false });
    }
  }

  async function handleScan(code) {
    setScannedCode(code);
    setLookupResult(null);
    setOcrLines([]);
    setForm({ ...EMPTY_FORM, serial_number: code });
    setStep('review');

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

  // ── single mode: confirm & save ────────────────────────────────────────────

  async function handleSingleConfirm(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    setErrors({});
    const payload = formToPayload(form);

    try {
      if (payload.serial_number) {
        try {
          const search = await api.get('/inventory/', { params: { search: payload.serial_number } });
          const existing = search.data.find((it) => it.serial_number === payload.serial_number);
          if (existing) {
            const updated = await api.put(`/inventory/${existing.id}`, {
              quantity: existing.quantity + payload.quantity,
              ...(payload.location ? { location: payload.location } : {}),
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

  // ── bulk mode: add to staging list ─────────────────────────────────────────

  function handleAddToStaging(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = formToPayload(form);
    setStagingList((prev) => [...prev, payload]);
    resetScan();
  }

  function removeFromStaging(idx) {
    setStagingList((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── bulk mode: commit all ──────────────────────────────────────────────────

  async function handleBulkCommit() {
    if (!stagingList.length) return;
    setSaving(true);
    setErrors({});
    try {
      const res = await api.post('/inventory/bulk', stagingList);
      setBulkResult(res.data);
      setStagingList([]);
      setStep('done');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setErrors({ _bulk: detail || 'Bulk save failed. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  // ── reset helpers ──────────────────────────────────────────────────────────

  function resetScan() {
    setStep('scan');
    setScannedCode('');
    setLookupResult(null);
    setOcrLines([]);
    setForm(EMPTY_FORM);
    setErrors({});
    setSavedItem(null);
    setBulkResult(null);
    setScanKey((k) => k + 1);
    setShowManual(false);
    setManualCode('');
  }

  function fullReset() {
    resetScan();
    setStagingList([]);
  }

  // ── render ─────────────────────────────────────────────────────────────────

  const isBulk = mode === 'bulk';

  return (
    <div className="receive-page">
      {/* Header */}
      <div className="receive-header">
        <button className="btn btn-ghost" onClick={() => navigate('/')}>&#8592; Back</button>
        <h1 className="receive-title">Receive Shipment</h1>
        <div className="receive-mode-toggle">
          <button
            className={`receive-mode-btn${!isBulk ? ' active' : ''}`}
            onClick={() => switchMode('single')}
          >Single</button>
          <button
            className={`receive-mode-btn${isBulk ? ' active' : ''}`}
            onClick={() => switchMode('bulk')}
          >Bulk</button>
        </div>
      </div>

      {/* Bulk staging list */}
      {isBulk && stagingList.length > 0 && step !== 'done' && (
        <div className="staging-bar">
          <span className="staging-count">{stagingList.length} item{stagingList.length !== 1 ? 's' : ''} staged</span>
          <div className="staging-items">
            {stagingList.map((item, i) => (
              <div key={i} className="staging-item">
                <span className="staging-item-name">{item.name}</span>
                {item.serial_number && <span className="staging-item-sn">S/N: {item.serial_number}</span>}
                <span className="staging-item-qty">×{item.quantity}</span>
                <button
                  className="staging-item-remove"
                  onClick={() => removeFromStaging(i)}
                  aria-label="Remove"
                >&#10005;</button>
              </div>
            ))}
          </div>
          {errors._bulk && <div className="form-error">{errors._bulk}</div>}
          <div className="staging-actions">
            <button className="btn btn-secondary" onClick={resetScan}>Scan More</button>
            <button
              className="btn btn-primary"
              onClick={handleBulkCommit}
              disabled={saving}
            >
              {saving ? 'Saving…' : `Commit All (${stagingList.length})`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: scan ── */}
      {step === 'scan' && (
        <div className="receive-body">
          <BarcodeScanner key={scanKey} onScan={handleScan} onTextFound={handleTextFound} />
          <div className="receive-manual-toggle">
            {showManual ? (
              <form className="receive-manual-form" onSubmit={handleManualSubmit}>
                <input
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
            <div className="receive-lookup-badge found">Product found — fields pre-filled from barcode database</div>
          )}
          {lookupResult?.found === false && (
            <div className="receive-lookup-badge not-found">No product match — enter details below</div>
          )}

          {ocrLines.length > 0 && (
            <div className="ocr-panel">
              <div className="ocr-panel-header">
                <span className="ocr-panel-title">Text found in photo</span>
                <span className="ocr-panel-hint">Tap a line to fill Name · long-press for Serial</span>
              </div>
              <div className="ocr-chips">
                {ocrLines.map((line, i) => (
                  <div key={i} className="ocr-chip-row">
                    <button
                      type="button"
                      className="ocr-chip"
                      onClick={() => set('name', line)}
                      title="Use as Name"
                    >
                      {line}
                    </button>
                    <button
                      type="button"
                      className="ocr-chip-sn"
                      onClick={() => set('serial_number', line)}
                      title="Use as Serial Number"
                    >
                      S/N
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form className="receive-form" onSubmit={isBulk ? handleAddToStaging : handleSingleConfirm}>
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
                  type="number" min="1"
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
              <button type="button" className="btn btn-secondary" onClick={resetScan}>
                &#8592; Re-scan
              </button>
              <button type="submit" className="btn btn-primary receive-confirm-btn" disabled={saving}>
                {isBulk
                  ? 'Add to List'
                  : saving ? 'Saving…' : 'Confirm Receipt'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── STEP: done (single) ── */}
      {step === 'done' && !isBulk && savedItem && (
        <div className="receive-body receive-done">
          <div className="receive-done-icon">&#10003;</div>
          <h2 className="receive-done-title">
            {savedItem._wasUpdated ? 'Stock Updated' : 'Item Received'}
          </h2>
          <div className="receive-done-name">{savedItem.name}</div>
          <div className="receive-done-meta">
            {savedItem.serial_number && <span>S/N: {savedItem.serial_number}</span>}
            <span>Qty: {savedItem.quantity}</span>
            {savedItem.location && <span>Location: {savedItem.location}</span>}
          </div>
          {savedItem._wasUpdated && (
            <div className="receive-done-note">
              Existing item found by serial number — quantity incremented.
            </div>
          )}
          <div className="receive-done-actions">
            <button className="btn btn-primary" onClick={fullReset}>Scan Another</button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>Go to Inventory</button>
          </div>
        </div>
      )}

      {/* ── STEP: done (bulk) ── */}
      {step === 'done' && isBulk && bulkResult && (
        <div className="receive-body receive-done">
          <div className="receive-done-icon">&#10003;</div>
          <h2 className="receive-done-title">Shipment Received</h2>
          <div className="receive-done-name">
            {bulkResult.count} item{bulkResult.count !== 1 ? 's' : ''} saved to inventory
          </div>
          <div className="receive-done-meta">
            {bulkResult.items.map((it) => (
              <span key={it.id}>{it.name} ×{it.quantity}</span>
            ))}
          </div>
          <div className="receive-done-actions">
            <button className="btn btn-primary" onClick={fullReset}>Receive Another Shipment</button>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>Go to Inventory</button>
          </div>
        </div>
      )}
    </div>
  );
}
