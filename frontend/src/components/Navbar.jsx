import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import api from '../api.jsx';

export default function Navbar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    api.get('/preferences/company')
      .then(res => setLogoUrl(res.data.logo_url || null))
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setMenuOpen(false);
  };

  const handleNav = (path) => {
    navigate(path);
    setMenuOpen(false);
  };

  const role = user?.role;
  const isAdmin = role === 'admin';
  const isManagerOrAdmin = role === 'admin' || role === 'manager';

  const initial = user?.username?.[0]?.toUpperCase() || '?';

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
        <span className="version-tag">v0.4.1</span>
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

      <div className="navbar-right" ref={menuRef}>
        <button
          className="user-menu-trigger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="true"
        >
          <span className="user-avatar">{initial}</span>
          <span className="user-menu-name">{user?.username}</span>
          <span className="user-role-pill" data-role={role}>{role}</span>
          <span className="user-menu-caret" aria-hidden="true">&#9660;</span>
        </button>

        {menuOpen && (
          <div className="user-dropdown" role="menu">
            <button
              className="user-dropdown-item"
              role="menuitem"
              onClick={() => handleNav('/preferences')}
            >
              Account Settings
            </button>
            <button
              className="user-dropdown-item"
              role="menuitem"
              onClick={() => handleNav('/change-password')}
            >
              Change Password
            </button>
            <div className="user-dropdown-divider" />
            <button
              className="user-dropdown-item danger"
              role="menuitem"
              onClick={handleLogout}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
