import React from 'react';
import type { ViewType } from './BottomNav';

interface LeftSidebarProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

export function LeftSidebar({ activeView, onViewChange }: LeftSidebarProps) {
  const navItems = [
    { id: 'home' as ViewType, label: 'Portfolio', icon: 'portfolio' },
    { id: 'home' as ViewType, label: 'Collectibles', icon: 'collectibles' },
    { id: 'home' as ViewType, label: 'Explore', icon: 'explore' },
    { id: 'swap' as ViewType, label: 'Trade', icon: 'trade' },
    { id: 'indicator' as ViewType, label: 'Indicator', icon: 'indicator' },
    { id: 'agent-builder' as ViewType, label: 'Agent Builder', icon: 'agent-builder' },
    { id: 'activity' as ViewType, label: 'Activity', icon: 'activity' },
    { id: 'x402' as ViewType, label: 'x402', icon: 'x402' },
  ];

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'portfolio':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        );
      case 'collectibles':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        );
      case 'explore':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
          </svg>
        );
      case 'trade':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 16V4M7 4L3 8M7 4l4 4" />
            <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
          </svg>
        );
      case 'activity':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        );
      case 'agent-builder':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <circle cx="12" cy="5" r="3" />
            <path d="M12 8v3" />
            <circle cx="8" cy="16" r="1" />
            <circle cx="16" cy="16" r="1" />
          </svg>
        );
      case 'x402':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M2 12h20" />
            <circle cx="12" cy="12" r="4" />
            <path d="M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        );
      case 'indicator':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3v18h18" />
            <path d="M18 9l-5 5-4-4-3 3" />
            <circle cx="18" cy="9" r="2" />
            <circle cx="13" cy="14" r="2" />
            <circle cx="9" cy="10" r="2" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <aside className="left-sidebar">
      <div className="sidebar-logo">
        <img
          src="icons/nebula_purple.png"
          alt="Nebula"
          style={{ width: '32px', height: '32px' }}
        />
        <span className="logo-text">Nebula</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item, index) => (
          <button
            key={`${item.id}-${index}`}
            className={`sidebar-nav-item ${activeView === item.id && (item.label === 'Portfolio' || item.label === 'Agent Builder') ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            <span className="nav-icon">{getIcon(item.icon)}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
