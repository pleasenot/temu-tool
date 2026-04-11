import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { MockupPage } from './components/mockup/MockupPage';
import { ListingPage } from './components/listing/ListingPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { AccountPage } from './components/account/AccountPage';

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Navigate to="/listing" replace />} />
        <Route path="/mockup" element={<MockupPage />} />
        <Route path="/listing" element={<ListingPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
