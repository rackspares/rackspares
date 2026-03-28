import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../App.jsx';
import api from '../api.jsx';

export default function Navbar() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    api.get('/preferences/company')
      .then(res => setLogoUrl(res.data.logo_url || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setNavOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
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

  const handleNavLink = () => setNavOpen(false);

  const role = user?.role;
  const isAdmin = role === 'admin';
  const isManagerOrAdmin = role === 'admin' || role === 'manager';
  const initial = user?.username?.[0]?.toUpperCase() || '?';

  return (
    <nav className="navbar">
      {/* Brand */}
      <div className="navbar-brand">
        <div className="navbar-brand-icon">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="navbar-brand-logo" />
            : <span>&#9881;</span>
          }
        </div>
        RackSpares
        <span className="version-tag">v0.5.2</span>
      </div>

      {/* Navigation dropdown */}
      <div className="nav-dropdown-wrapper" ref={navRef}>
        <button
          className="nav-dropdown-trigger"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-haspopup="true"
        >
          Navigation
          <span className="nav-dropdown-caret" aria-hidden="true">&#9660;</span>
        </button>

        {navOpen && (
          <div className="nav-dropdown" role="menu">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
              onClick={handleNavLink}
            >
              Inventory
            </NavLink>
            {isManagerOrAdmin && (
              <NavLink
                to="/receive"
                className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                onClick={handleNavLink}
              >
                Receive Shipment
              </NavLink>
            )}
            {isManagerOrAdmin && (
              <NavLink
                to="/reorder"
                className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                onClick={handleNavLink}
              >
                Reorder
              </NavLink>
            )}
            <NavLink
              to="/boms"
              className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
              onClick={handleNavLink}
            >
              BOMs
            </NavLink>
            <NavLink
              to="/netbox/browse"
              className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
              onClick={handleNavLink}
            >
              Netbox
            </NavLink>
            {isManagerOrAdmin && (
              <NavLink
                to="/netbox/clone"
                className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                onClick={handleNavLink}
              >
                Clone Rack
              </NavLink>
            )}
            <NavLink
              to="/optics"
              className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
              onClick={handleNavLink}
            >
              Optics
            </NavLink>
            {isManagerOrAdmin && (
              <NavLink
                to="/audit"
                className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                onClick={handleNavLink}
              >
                Audit Log
              </NavLink>
            )}
            {isAdmin && (
              <>
                <div className="nav-dropdown-divider" />
                <NavLink
                  to="/users"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  Users
                </NavLink>
                <NavLink
                  to="/categories"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  Categories
                </NavLink>
                <NavLink
                  to="/netbox"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  NB Settings
                </NavLink>
                <NavLink
                  to="/services"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  Services
                </NavLink>
                <NavLink
                  to="/ldap"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  LDAP / AD
                </NavLink>
                <NavLink
                  to="/sites"
                  className={({ isActive }) => `nav-dropdown-item${isActive ? ' active' : ''}`}
                  onClick={handleNavLink}
                >
                  Sites
                </NavLink>
              </>
            )}
          </div>
        )}
      </div>

      {/* User menu */}
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
