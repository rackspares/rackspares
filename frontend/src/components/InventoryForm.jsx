import React, { useEffect, useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'in_use',    label: 'In Use' },
  { value: 'faulty',    label: 'Faulty' },
  { value: 'retired',   label: 'Retired' },
];

const EMPTY = {
  name: '',
  serial_number: '',
  category_id: '',
  item_type: 'asset',
  quantity: 1,
  location: '',
  status: 'available',
  condition: 'new',
  description: '',
  minimum_stock: '',
  lead_time_days: '',
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
      {node.children.length > 0 && (
        <CategoryOptions nodes={node.children} depth={depth + 1} />
      )}
    </React.Fragment>
  ));
}

export default function InventoryForm({ item, categories, onSave, onClose, saving }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const categoryTree = buildCategoryTree(categories || []);

  useEffect(() => {
    if (item) {
      setForm({
        name:           item.name           ?? '',
        serial_number:  item.serial_number  ?? '',
        category_id:    item.category_id    ?? '',
        item_type:      item.item_type      ?? 'asset',
        quantity:       item.quantity       ?? 0,
        location:       item.location       ?? '',
        status:         item.status         ?? 'available',
        condition:      item.condition      ?? 'new',
        description:    item.description    ?? '',
        minimum_stock:  item.minimum_stock  ?? '',
        lead_time_days: item.lead_time_days ?? '',
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
    if (!form.name.trim()) e.name = 'Name is required';
    if (Number(form.quantity) < 0) e.quantity = 'Quantity cannot be negative';
    if (form.minimum_stock !== '' && Number(form.minimum_stock) < 0)
      e.minimum_stock = 'Cannot be negative';
    if (form.lead_time_days !== '' && Number(form.lead_time_days) < 0)
      e.lead_time_days = 'Cannot be negative';
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const payload = {
      ...form,
      quantity:       Number(form.quantity),
      category_id:    form.category_id !== '' ? Number(form.category_id) : null,
      serial_number:  form.serial_number.trim() || null,
      minimum_stock:  form.minimum_stock !== '' ? Number(form.minimum_stock) : null,
      lead_time_days: form.lead_time_days !== '' ? Number(form.lead_time_days) : null,
    };
    onSave(payload);
  };

  const isConsumable = form.item_type === 'consumable';
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

              {/* Serial Number */}
              <div className="form-group form-col-span">
                <label className="form-label">Serial Number</label>
                <input
                  className="form-input"
                  value={form.serial_number}
                  onChange={(e) => set('serial_number', e.target.value)}
                  placeholder="e.g. SN-ABC123 (optional, must be unique)"
                />
              </div>

              {/* Item Type */}
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

              {/* Category */}
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

              {/* Condition */}
              <div className="form-group">
                <label className="form-label">Condition</label>
                <select
                  className="form-input"
                  value={form.condition}
                  onChange={(e) => set('condition', e.target.value)}
                >
                  <option value="new">New</option>
                  <option value="used">Used</option>
                </select>
              </div>

              {/* Consumable-only fields */}
              {isConsumable && (
                <>
                  <div className="form-group">
                    <label className="form-label">Minimum Stock</label>
                    <input
                      type="number"
                      min="0"
                      className={`form-input${errors.minimum_stock ? ' has-error' : ''}`}
                      value={form.minimum_stock}
                      onChange={(e) => set('minimum_stock', e.target.value)}
                      placeholder="Reorder threshold"
                    />
                    {errors.minimum_stock && <div className="form-error">{errors.minimum_stock}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Lead Time (days)</label>
                    <input
                      type="number"
                      min="0"
                      className={`form-input${errors.lead_time_days ? ' has-error' : ''}`}
                      value={form.lead_time_days}
                      onChange={(e) => set('lead_time_days', e.target.value)}
                      placeholder="e.g. 5"
                    />
                    {errors.lead_time_days && <div className="form-error">{errors.lead_time_days}</div>}
                  </div>
                </>
              )}

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
