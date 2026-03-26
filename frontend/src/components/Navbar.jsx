import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import api from '../api.jsx';

const ROLE_BADGE = {
  admin:   { label: 'admin',   cls: 'navbar-role-badge admin' },
  manager: { label: 'manager', cls: 'navbar-role-badge manager' },
  viewer:  { label: 'viewer',  cls: 'navbar-role-badge viewer' },
};

export default function Navbar() {
  const { user, setUser } = useAuth();
  const [logoUrl, setLogoUrl] = useState(null);

  useEffect(() => {
    api.get('/preferences/company')
      .then(res => setLogoUrl(res.data.logo_url || null))
      .catch(() => {});
  }, []);

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
        <div className="navbar-brand-icon">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="navbar-brand-logo" />
            : <span>&#9881;</span>
          }
        </div>
        RackSpares
        <span className="version-tag">v0.4.0</span>
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
        <NavLink
          to="/netbox/browse"
          className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
        >
          Netbox
        </NavLink>
        {isManagerOrAdmin && (
          <NavLink
            to="/netbox/clone"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            Clone&nbsp;Rack
          </NavLink>
        )}
        <NavLink
          to="/optics"
          className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
        >
          Optics
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
        {isAdmin && (
          <NavLink
            to="/netbox"
            className={({ isActive }) => `navbar-link${isActive ? ' active' : ''}`}
          >
            NB&nbsp;Settings
          </NavLink>
        )}
      </div>

      <div className="navbar-right">
        <span className="navbar-user">
          {user?.username}
          {badge && <span className={badge.cls}>{badge.label}</span>}
        </span>
        <NavLink
          to="/preferences"
          className={({ isActive }) => `btn-logout${isActive ? ' active' : ''}`}
          style={{ textDecoration: 'none', fontSize: 13 }}
          title="Theme & Preferences"
        >
          &#9680;
        </NavLink>
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
