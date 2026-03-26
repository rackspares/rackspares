import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../App.jsx';

const ROLE_BADGE = {
  admin:   { label: 'admin',   cls: 'navbar-role-badge admin' },
  manager: { label: 'manager', cls: 'navbar-role-badge manager' },
  viewer:  { label: 'viewer',  cls: 'navbar-role-badge viewer' },
};

export default function Navbar() {
  const { user, setUser } = useAuth();

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const role = user?.role;
  const badge = ROLE_BADGE[role];
  const isAdmin = role === 'admin';
  const isManagerOrAdmin = role === 'admin' || role === 'manager';

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="navbar-brand-icon">&#9881;</div>
        RackSpares
        <span className="version-tag">v0.3.0</span>
      </div>

      <div className="navbar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
        >
          Inventory
        </NavLink>
        {isManagerOrAdmin && (
          <NavLink
            to="/reorder"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            Reorder
          </NavLink>
        )}
        <NavLink
          to="/boms"
          className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
        >
          BOMs
        </NavLink>
        {isManagerOrAdmin && (
          <NavLink
            to="/audit"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            Audit Log
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/users"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            Users
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/categories"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            Categories
          </NavLink>
        )}
      </div>

      <div className="navbar-right">
        <span className="navbar-user">
          {user?.username}
          {badge && <span className={badge.cls}>{badge.label}</span>}
        </span>
        <NavLink
          to="/change-password"
          className={({ isActive }) => `btn-logout${isActive ? ' active' : ''}`}
          style={{ textDecoration: 'none', fontSize: 13 }}
        >
          Password
        </NavLink>
        <button className="btn-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
