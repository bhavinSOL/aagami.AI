import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Settings, Calendar, FileText, TrendingUp, Bell, LogOut, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { path: '/predictions', label: 'Predictions', icon: TrendingUp, adminOnly: false },
  { path: '/calendar', label: 'Calendar', icon: Calendar, adminOnly: false },
  { path: '/notifications', label: 'Notifications', icon: Bell, adminOnly: false },
  { path: '/tutorial', label: 'Tutorial', icon: FileText, adminOnly: false },
  { path: '/admin', label: 'Admin Panel', icon: Settings, adminOnly: true },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();

  // Filter nav items based on role
  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    onClose?.();
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
      >
        {/* Logo + mobile close button */}
        <div className="flex h-20 items-center justify-center border-b border-sidebar-border relative">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
              <span className="text-lg font-bold text-sidebar-primary-foreground">T</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-sidebar-foreground">TATA Motors</h1>
              <p className="text-xs text-sidebar-foreground/60">Attendance Portal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors md:hidden"
          >
            <X className="h-5 w-5 text-sidebar-foreground/60" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-4">
          <ul className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    onClick={handleNavClick}
                    className={`nav-link ${isActive ? 'nav-link-active' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-9 w-9 rounded-full flex items-center justify-center ${isAdmin ? 'bg-amber-100' : 'bg-blue-100'}`}>
                <span className={`text-sm font-medium ${isAdmin ? 'text-amber-700' : 'text-blue-700'}`}>
                  {isAdmin ? 'A' : 'U'}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-sidebar-foreground">{user?.name || 'Guest'}</p>
                <p className="text-xs text-sidebar-foreground/60">
                  {isAdmin ? 'Admin' : 'Viewer'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4 text-sidebar-foreground/60" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
