import React, { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import api from './api.jsx';
import Navbar from './components/Navbar.jsx';
import Inventory from './pages/Inventory.jsx';
import Login from './pages/Login.jsx';
import UserManagement from './pages/UserManagement.jsx';
import AuditLog from './pages/AuditLog.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import CategoryManagement from './pages/CategoryManagement.jsx';
import Reorder from './pages/Reorder.jsx';
import BOMs from './pages/BOMs.jsx';
import BOMDetail from './pages/BOMDetail.jsx';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((res) => setUser(res.data))
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
      <BrowserRouter>
        {user && <Navbar />}
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
