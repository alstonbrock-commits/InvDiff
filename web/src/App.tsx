import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import EnterpriseStart from './pages/EnterpriseStart';
import IndividualStart from './pages/IndividualStart';
import CheckoutSuccess from './pages/CheckoutSuccess';
import CheckoutCancelled from './pages/CheckoutCancelled';
import Billing from './pages/Billing';
import Invite from './pages/Invite';
import AccountDelete from './pages/AccountDelete';
import Legal from './pages/Legal';
import ForgotPassword from './pages/ForgotPassword';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/enterprise/start" element={<EnterpriseStart />} />
        <Route path="/individual/start" element={<IndividualStart />} />
        <Route path="/checkout/success" element={<CheckoutSuccess />} />
        <Route path="/checkout/cancelled" element={<CheckoutCancelled />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="/account/delete" element={<AccountDelete />} />
        <Route path="/terms" element={<Legal kind="terms" />} />
        <Route path="/privacy" element={<Legal kind="privacy" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
