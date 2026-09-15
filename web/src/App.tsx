import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import AccountDelete from './pages/AccountDelete';
import Legal from './pages/Legal';
import ForgotPassword from './pages/ForgotPassword';

// The site is deliberately small: the stores require hosted Terms, Privacy
// and an account-deletion page; everything else (sign-up, billing) happens
// in the app through Apple / Google.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/account/delete" element={<AccountDelete />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
