import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import api from './api.jsx';
import Navbar from './components/Navbar.jsx';
import AdminTicker from './components/AdminTicker.jsx';
import Inventory from './pages/Inventory.jsx';
import Login from './pages/Login.jsx';
import UserManagement from './pages/UserManagement.jsx';
import AuditLog from './pages/AuditLog.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import CategoryManagement from './pages/CategoryManagement.jsx';
import Reorder from './pages/Reorder.jsx';
import BOMs from './pages/BOMs.jsx';
import BOMDetail from './pages/BOMDetail.jsx';
import NetboxSettings from './pages/NetboxSettings.jsx';
import NetboxBrowse from './pages/NetboxBrowse.jsx';
import CloneARack from './pages/CloneARack.jsx';
import OpticCompatibility from './pages/OpticCompatibility.jsx';
import UserPreferences from './pages/UserPreferences.jsx';
import ReceiveShipment from './pages/ReceiveShipment.jsx';
import ServicesAdmin from './pages/ServicesAdmin.jsx';
import LDAPSettings from './pages/LDAPSettings.jsx';
import AdminSites from './pages/AdminSites.jsx';

export const AuthContext = createContext(null);
export const ThemeContext = createContext({ theme: 'dark', accent: '#2563eb', setTheme: () => {}, setAccent: () => {} });
export const SiteContext = createContext({ activeSiteId: null, setActiveSiteId: () => {} });

export function useAuth() {
  return useContext(AuthContext);
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useSiteContext() {
  return useContext(SiteContext);
}

function applyTheme(theme, accent) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.setProperty('--color-accent', accent);
  // Derive hover color (slightly darker)
  document.documentElement.style.setProperty('--color-accent-hover', accent);
  document.documentElement.style.setProperty(
    '--color-accent-faint',
    `${accent}26` // 15% opacity
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState(() => localStorage.getItem('rs-theme') || 'dark');
  const [accent, setAccentState] = useState(() => localStorage.getItem('rs-accent') || '#2563eb');
  const [activeSiteId, setActiveSiteId] = useState(null);

  // Apply theme immediately on mount and on changes
  useEffect(() => {
    applyTheme(theme, accent);
  }, [theme, accent]);

  const setTheme = useCallback((t) => {
    setThemeState(t);
    localStorage.setItem('rs-theme', t);
  }, []);

  const setAccent = useCallback((a) => {
    setAccentState(a);
    localStorage.setItem('rs-accent', a);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => {
        setUser(res.data);
        // Load preferences — failure here is non-fatal; keep defaults
        api.get('/preferences/me')
          .then((pref) => {
            if (pref?.data?.theme) setTheme(pref.data.theme);
            if (pref?.data?.accent_color) setAccent(pref.data.accent_color);
          })
          .catch(() => {});
      })
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  const isAdmin = user?.role === 'admin';
  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager';

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent }}>
      <SiteContext.Provider value={{ activeSiteId, setActiveSiteId }}>
        <BrowserRouter>
          {user && <Navbar />}
          {user && <AdminTicker />}
          <Routes>
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />
            <Route
              path="/"
              element={user ? <Inventory /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/users"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <UserManagement />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/audit"
              element={
                !user ? <Navigate to="/login" replace />
                : isManagerOrAdmin ? <AuditLog />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/change-password"
              element={user ? <ChangePassword /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/categories"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <CategoryManagement />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/reorder"
              element={
                !user ? <Navigate to="/login" replace />
                : isManagerOrAdmin ? <Reorder />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/boms"
              element={user ? <BOMs /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/boms/:id"
              element={user ? <BOMDetail /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/netbox"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <NetboxSettings />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/netbox/browse"
              element={user ? <NetboxBrowse /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/netbox/clone"
              element={
                !user ? <Navigate to="/login" replace />
                : isManagerOrAdmin ? <CloneARack />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/optics"
              element={user ? <OpticCompatibility /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/preferences"
              element={user ? <UserPreferences /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/receive"
              element={
                !user ? <Navigate to="/login" replace />
                : isManagerOrAdmin ? <ReceiveShipment />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/services"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <ServicesAdmin />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/ldap"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <LDAPSettings />
                : <Navigate to="/" replace />
              }
            />
            <Route
              path="/sites"
              element={
                !user ? <Navigate to="/login" replace />
                : isAdmin ? <AdminSites />
                : <Navigate to="/" replace />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </SiteContext.Provider>
      </ThemeContext.Provider>
    </AuthContext.Provider>
  );
}
