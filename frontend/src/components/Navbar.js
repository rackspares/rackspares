import React from 'react';
import { useAuth } from '../App';

export default function Navbar() {
  const { user, setUser } = useAuth();

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <div className="navbar-brand-icon">&#9881;</div>
        RackSpares
        <span className="version-tag">v0.1.0</span>
      </div>
      <div className="navbar-right">
        <span className="navbar-user">
          {user?.username}
          {user?.is_admin && (
            <span className="navbar-admin-badge">admin</span>
          )}
        </span>
        <button className="btn-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
