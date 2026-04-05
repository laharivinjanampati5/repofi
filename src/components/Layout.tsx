import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, AlertTriangle, Share2, FileSearch, ListTodo, BarChart3, SlidersHorizontal, MapPinned,
  Bell, ChevronLeft, ChevronRight, Activity, User
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROLES } from '@/types/domain';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/exceptions', icon: AlertTriangle, label: 'Exception Board' },
  { to: '/knowledge-graph', icon: Share2, label: 'Knowledge Graph' },
  { to: '/shipment-decision', icon: FileSearch, label: 'Shipment Decision' },
  { to: '/action-center', icon: ListTodo, label: 'Action Center' },
  { to: '/kpi-insights', icon: BarChart3, label: 'KPI Insights' },
  { to: '/scenario-analysis', icon: SlidersHorizontal, label: 'Scenario Analysis' },
  { to: '/risk-heatmap', icon: MapPinned, label: 'Risk Heatmap' },
];

interface LayoutProps {
  children: React.ReactNode;
  role: string;
  onRoleChange: (role: string) => void;
}

export default function Layout({ children, role, onRoleChange }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-sidebar flex flex-col border-r border-sidebar-border transition-all duration-300 shrink-0`}>
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-sidebar-border min-h-[56px]">
          <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-sidebar-primary tracking-wide">DP WORLD</p>
              <p className="text-[10px] text-sidebar-foreground truncate">AI Control Tower</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${active ? 'bg-sidebar-accent text-sidebar-primary font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/50'}`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-3 border-t border-sidebar-border text-sidebar-foreground hover:text-sidebar-primary transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 mx-auto" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-14 border-b flex items-center justify-between px-4 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground hidden sm:block">AI Control Tower</h1>
            <Badge variant="outline" className="text-xs border-secondary text-secondary">LIVE</Badge>
          </div>
          <div className="flex items-center gap-3">
            {/* Role selector */}
            <select
              value={role}
              onChange={e => onRoleChange(e.target.value)}
              className="text-xs bg-muted rounded-md px-2 py-1 border-none outline-none text-foreground"
            >
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">3</span>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                <User className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-xs font-medium hidden md:block">{ROLES.find(r => r.id === role)?.label}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
