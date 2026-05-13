import type { AppTab, AppTabId } from '../../app/config';

interface SidebarTabsProps {
  title: string;
  tabs: AppTab[];
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
}

function SidebarTabs({ title, tabs, activeTab, onTabChange }: SidebarTabsProps) {
  return (
    <aside className="sidebar">
      <p className="brand">{title}</p>
      <nav className="tab-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default SidebarTabs;
