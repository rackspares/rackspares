/**
 * CategorySelect — creatable combobox for inventory category fields.
 *
 * Self-contained: fetches its own category list, handles inline creation.
 * Calls onChange(id) when a category is selected or created.
 * Displays a "New" badge for freshly-created categories until the form is cleared.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api.jsx';

function buildFlatList(flat) {
  // Returns [{id, name, parent_id, depth, label}, ...] sorted for display
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

  const result = [];
  function walk(nodes, depth) {
    nodes.forEach((n) => {
      result.push({ id: n.id, name: n.name, parent_id: n.parent_id, depth });
      if (n.children.length) walk(n.children, depth + 1);
    });
  }
  walk(roots, 0);
  return result;
}

export default function CategorySelect({ value, onChange, disabled = false, parentId = null }) {
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newlyCreatedIds, setNewlyCreatedIds] = useState(new Set());
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const load = useCallback(() => {
    api.get('/categories/').then((r) => setCategories(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const flatList = buildFlatList(categories);
  const selectedCat = flatList.find((c) => c.id === Number(value));

  const filtered = query.trim()
    ? flatList.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : flatList;

  const exactMatch = flatList.some(
    (c) => c.name.toLowerCase() === query.trim().toLowerCase()
  );

  const isNew = value && newlyCreatedIds.has(Number(value));

  async function handleCreate() {
    const name = query.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await api.post('/categories/', { name, parent_id: parentId });
      const cat = res.data;
      setCategories((prev) => [...prev, cat]);
      setNewlyCreatedIds((prev) => new Set([...prev, cat.id]));
      onChange(cat.id);
      setQuery('');
      setOpen(false);
    } catch (err) {
      // If idempotent return came back with existing, still select it
      const existing = flatList.find(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      if (existing) {
        onChange(existing.id);
        setQuery('');
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  function handleSelect(id) {
    onChange(id);
    setQuery('');
    setOpen(false);
  }

  function handleClear(e) {
    e.stopPropagation();
    onChange('');
  }

  function handleOpen() {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative' }}
      className="category-select-root"
    >
      {/* Trigger */}
      <div
        className={`form-input category-select-trigger${disabled ? ' disabled' : ''}`}
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          minHeight: 38,
          gap: 6,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedCat ? selectedCat.name : <span style={{ color: 'var(--color-text-muted)' }}>— None —</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {isNew && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              padding: '1px 5px', borderRadius: 3,
              background: 'var(--color-accent)', color: '#fff',
            }}>NEW</span>
          )}
          {selectedCat && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-muted)', padding: '0 2px', lineHeight: 1,
              }}
              aria-label="Clear category"
            >&#10005;</button>
          )}
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>&#9660;</span>
        </span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--color-bg-card)', border: '1px solid var(--color-border)',
          borderRadius: 6, marginTop: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          maxHeight: 280, display: 'flex', flexDirection: 'column',
        }}>
          {/* Search input */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
            <input
              ref={inputRef}
              className="form-input"
              style={{ margin: 0, padding: '5px 8px', fontSize: 13 }}
              placeholder="Search or create…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered.length === 1) {
                    handleSelect(filtered[0].id);
                  } else if (!exactMatch && query.trim()) {
                    handleCreate();
                  }
                }
                if (e.key === 'Escape') { setOpen(false); setQuery(''); }
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Clear option */}
            <div
              onClick={() => handleSelect('')}
              style={{
                padding: '7px 12px', cursor: 'pointer', fontSize: 13,
                color: 'var(--color-text-muted)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              — None —
            </div>

            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelect(c.id)}
                style={{
                  padding: '7px 12px',
                  paddingLeft: 12 + c.depth * 16,
                  cursor: 'pointer',
                  fontSize: 13,
                  background: c.id === Number(value) ? 'var(--color-accent-faint)' : 'transparent',
                  color: 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => { if (c.id !== Number(value)) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = c.id === Number(value) ? 'var(--color-accent-faint)' : 'transparent'; }}
              >
                {c.depth > 0 && <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>↳</span>}
                <span>{c.name}</span>
                {newlyCreatedIds.has(c.id) && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                    background: 'var(--color-accent)', color: '#fff', marginLeft: 'auto',
                  }}>NEW</span>
                )}
              </div>
            ))}

            {/* Create option */}
            {query.trim() && !exactMatch && (
              <div
                onClick={handleCreate}
                style={{
                  padding: '7px 12px', cursor: creating ? 'wait' : 'pointer',
                  fontSize: 13, borderTop: '1px solid var(--color-border)',
                  color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontWeight: 600 }}>+</span>
                {creating ? 'Creating…' : <>Create <strong>"{query.trim()}"</strong></>}
              </div>
            )}

            {filtered.length === 0 && !query.trim() && (
              <div style={{ padding: '12px', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No categories yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
