import React from 'react';

const LABELS = {
  available: 'Available',
  in_use: 'In Use',
  faulty: 'Faulty',
  retired: 'Retired',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status}`}>
      <span className="badge-dot" />
      {LABELS[status] ?? status}
    </span>
  );
}
