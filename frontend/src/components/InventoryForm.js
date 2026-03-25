import React, { useEffect, useState } from 'react';

const CATEGORIES = [
  'Server', 'Network', 'Storage', 'Power',
  'Cooling', 'Cable', 'Accessory', 'Other',
];

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'in_use',    label: 'In Use' },
  { value: 'faulty',    label: 'Faulty' },
  { value: 'retired',   label: 'Retired' },
];

const EMPTY = {
  name: '',
  category: 'Server',
  quantity: 1,
  location: '',
  status: 'available',
  description: '',
};

export default function InventoryForm({ item, onSave, onClose, saving }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (item) {
      setForm({
        name:        item.name        ?? '',
        category:    item.category    ?? 'Server',
        quantity:    item.quantity    ?? 0,
        location:    item.location    ?? '',
        status:      item.status      ?? 'available',
        description: item.description ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [item]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())    e.name     = 'Name is required';
    if (!form.category.trim()) e.category = 'Category is required';
    if (Number(form.quantity) < 0) e.quantity = 'Quantity cannot be negative';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({ ...form, quantity: Number(form.quantity) });
  };

  const stopPropagation = (e) => e.stopPropagation();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={stopPropagation}>
        <div className="modal-header">
          <h2 className="modal-title">{item ? 'Edit Item' : 'Add Item'}</h2>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Close">
            &#10005;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-grid">
              {/* Name */}
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

              {/* Category */}
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select
                  className={`form-input${errors.category ? ' has-error' : ''}`}
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.category && <div className="form-error">{errors.category}</div>}
              </div>

              {/* Quantity */}
              <div className="form-group">
                <label className="form-label">Quantity</label>
                <input
                  type="number"
                  min="0"
                  className={`form-input${errors.quantity ? ' has-error' : ''}`}
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                />
                {errors.quantity && <div className="form-error">{errors.quantity}</div>}
              </div>

              {/* Location */}
              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  placeholder="e.g. Rack A3, Shelf 2"
                />
              </div>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-input"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="form-group form-col-span">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Optional notes, part numbers, specs..."
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : item ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
