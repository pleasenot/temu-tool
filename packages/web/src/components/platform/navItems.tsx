import { Rocket, Images, UserCircle, Settings, type LucideIcon } from 'lucide-react';

export type NavSection = 'WORKSHOP' | 'SYSTEM';

export interface NavItem {
  id: string;
  to: string;
  label: string;
  icon: LucideIcon;
  section: NavSection;
  badge?: string;
}

/**
 * Add a new page → push one entry here. Zero JSX/CSS/layout changes needed.
 */
export const navItems: NavItem[] = [
  { id: 'listing', to: '/listing', label: '自动上品', icon: Rocket, section: 'WORKSHOP' },
  { id: 'mockup', to: '/mockup', label: '批量套图', icon: Images, section: 'WORKSHOP' },
  { id: 'account', to: '/account', label: '账号管理', icon: UserCircle, section: 'SYSTEM' },
  { id: 'settings', to: '/settings', label: '设置', icon: Settings, section: 'SYSTEM' },
];
