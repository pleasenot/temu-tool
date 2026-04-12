import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AppShell } from './components/platform';
import { MockupPage } from './components/mockup/MockupPage';
import { ListingPage } from './components/listing/ListingPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { AccountPage } from './components/account/AccountPage';

function AppShellRoute() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShellRoute />}>
        <Route path="/" element={<Navigate to="/listing" replace />} />
        <Route path="/mockup" element={<MockupPage />} />
        <Route path="/listing" element={<ListingPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
