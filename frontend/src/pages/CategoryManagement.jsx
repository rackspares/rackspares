import React, { useEffect, useState } from 'react';
import api from '../api.jsx';

function buildTree(flat) {
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

function CategoryNode({ node, depth, onEdit, onDelete, onAddChild, maxDepth }) {
  const canAddChild = depth < maxDepth - 1;
  return (
    <div className={`cat-node depth-${depth}`}>
      <div className="cat-node-row">
        <span className="cat-node-name">{node.name}</span>
        <div className="cat-node-actions">
          {canAddChild && (
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => onAddChild(node)}>
              + Sub-category
            </button>
          )}
          <button className="btn-icon" title="Rename" onClick={() => onEdit(node)}>&#9998;</button>
          <button className="btn-icon danger" title="Delete" onClick={() => onDelete(node)}>&#128465;</button>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="cat-children">
          {node.children.map((child) => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              maxDepth={maxDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryManagement() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // Modal state
  const [modal, setModal]           = useState(null); // { mode: 'add'|'edit', node?, parent? }
  const [formName, setFormName]     = useState('');
  const [formError, setFormError]   = useState('');
  const [saving, setSaving]         = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories/');
      setCategories(res.data);
    } catch {
      setError('Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCategories(); }, []);

  const openAdd = () => { setModal({ mode: 'add', parent: null }); setFormName(''); setFormError(''); };
  const openAddChild = (parent) => { setModal({ mode: 'add', parent }); setFormName(''); setFormError(''); };
  const openEdit = (node) => { setModal({ mode: 'edit', node }); setFormName(node.name); setFormError(''); };
  const closeModal = () => { setModal(null); setFormError(''); };

  const handleSave = async () => {
    if (!formName.trim()) { setFormError('Name is required'); return; }
    setSaving(true);
    setFormError('');
    try {
      if (modal.mode === 'add') {
        await api.post('/categories/', {
          name: formName.trim(),
          parent_id: modal.parent?.id ?? null,
        });
      } else {
        await api.put(`/categories/${modal.node.id}`, { name: formName.trim() });
      }
      closeModal();
      await fetchCategories();
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (node) => {
    if (!window.confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/categories/${node.id}`);
      await fetchCategories();
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed');
    }
  };

  const tree = buildTree(categories);

  return (
    <main className="main-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">Manage inventory categories (max 3 levels)</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Category</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading...</div>
        ) : tree.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#128230;</div>
            <div className="empty-title">No categories yet</div>
            <div className="empty-text">Add your first category to get started.</div>
          </div>
        ) : (
          tree.map((node) => (
            <CategoryNode
              key={node.id}
              node={node}
              depth={0}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddChild={openAddChild}
              maxDepth={3}
            />
          ))
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {modal.mode === 'edit'
                  ? `Rename "${modal.node.name}"`
                  : modal.parent
                  ? `Add sub-category under "${modal.parent.name}"`
                  : 'Add Category'}
              </h2>
              <button className="btn-icon" onClick={closeModal}>&#10005;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input
                  className={`form-input${formError ? ' has-error' : ''}`}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                />
                {formError && <div className="form-error">{formError}</div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : modal.mode === 'edit' ? 'Rename' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
