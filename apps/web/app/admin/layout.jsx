import AdminShell from '@/components/admin/AdminShell';

// Every page under /admin: kept out of search engines, and behind the sign-in (components/admin/AdminShell.jsx; /admin/login, /admin/setup and
// the forgotten-password pages /admin/forgot, /admin/reset and /admin/verify-email are open: OPEN_ADMIN_PATHS in lib/data/admin.js). The data itself is protected by the API, which checks the session on every call.
export const metadata = {
  title: 'VoxelVenture admin',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
