import { NavLink } from 'react-router-dom';
import { Home, HelpCircle, BarChart3 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/cn';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'border-accent text-text'
      : 'border-transparent text-muted hover:text-text',
  );

export function Nav() {
  const { adminKey } = useApp();
  return (
    <nav className="sticky top-0 z-30 flex items-center gap-1 border-b border-border bg-panel/95 px-2 backdrop-blur sm:px-6">
      <NavLink to="/board" className={linkClass}>
        <Home className="h-4 w-4" /> Board
      </NavLink>
      <NavLink to="/help" className={linkClass}>
        <HelpCircle className="h-4 w-4" /> How it works
      </NavLink>
      {adminKey && (
        <NavLink to="/admin" className={linkClass}>
          <BarChart3 className="h-4 w-4" /> Admin
        </NavLink>
      )}
    </nav>
  );
}
