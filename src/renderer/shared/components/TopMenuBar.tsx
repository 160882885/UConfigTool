import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppMeta, ProjectInfo } from '../../../../shared/contracts';
import { appBridge } from '../api/appBridge';

interface TopMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
}

interface TopMenu {
  key: string;
  label: string;
  items: TopMenuItem[];
}

const BASE_MENUS: TopMenu[] = [
  {
    key: 'file',
    label: '文件',
    items: []
  }
];

function createMenus(appTitle: string, hasProject: boolean): TopMenu[] {
  const fileMenu: TopMenu = {
    key: 'file',
    label: '文件',
    items: [
      { id: 'create-project', label: '创建项目' },
      { id: 'open-project', label: '打开项目' },
      { id: 'show-project-folder', label: '显示项目文件夹', disabled: !hasProject }
    ]
  };

  return [
    fileMenu,
    ...BASE_MENUS.filter((menu) => menu.key !== 'file'),
    {
      key: 'help',
      label: '帮助',
      items: [
        { id: 'welcome', label: '欢迎' },
        { id: 'release-notes', label: '发行说明' },
        { id: 'about', label: `关于 ${appTitle}` }
      ]
    }
  ];
}

interface TopMenuBarProps {
  appTitle: string;
  appMeta: AppMeta | null;
}

function TopMenuBar({ appTitle, appMeta }: TopMenuBarProps) {
  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const hasProject = Boolean(currentProject?.path);

  useEffect(() => {
    let active = true;

    async function loadProjectInfo() {
      try {
        const project = await appBridge.getCurrentProject();
        if (!active) {
          return;
        }
        setCurrentProject(project ?? null);
      } catch {
        if (!active) {
          return;
        }
        setCurrentProject(null);
      }
    }

    void loadProjectInfo();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const root = rootRef.current;
      if (root && !root.contains(target)) {
        setOpenMenuKey(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  const menus = useMemo(() => createMenus(appTitle, hasProject), [appTitle, hasProject]);

  const handleMenuItemClick = async (menuKey: string, item: TopMenuItem) => {
    if (item.disabled) {
      return;
    }

    setOpenMenuKey(null);

    if (menuKey !== 'file') {
      return;
    }

    if (item.id === 'create-project') {
      const project = await appBridge.createProject();
      setCurrentProject(project ?? null);
      if (project) {
        window.location.reload();
      }
      return;
    }

    if (item.id === 'open-project') {
      const project = await appBridge.openProject();
      setCurrentProject(project ?? null);
      if (project) {
        window.location.reload();
      }
      return;
    }

    if (item.id === 'show-project-folder') {
      await appBridge.showCurrentProjectFolder();
    }
  };

  return (
    <header className="workbench-topbar">
      <div className="topbar-drag-region" ref={rootRef}>
        <div className="topbar-left">
          <button type="button" className="topbar-app-icon" aria-label={`${appTitle} 图标`}>
            <span className="topbar-app-mark" aria-hidden="true">
              CT
            </span>
          </button>

          <div className="top-menu-row">
            {menus.map((menu) => {
              const isOpen = openMenuKey === menu.key;
              return (
                <div className="top-menu-group" key={menu.key}>
                  <button
                    type="button"
                    className={`top-menu-btn${isOpen ? ' open' : ''}`}
                    onClick={() => setOpenMenuKey((previous) => (previous === menu.key ? null : menu.key))}
                  >
                    {menu.label}
                  </button>

                  {isOpen ? (
                    <div className="top-menu-dropdown" role="menu" aria-label={`${menu.label} 菜单`}>
                      {menu.items.map((item) => (
                        <button
                          key={`${menu.key}-${item.id}`}
                          type="button"
                          className="top-menu-dropdown-item"
                          disabled={item.disabled}
                          onClick={() => {
                            void handleMenuItemClick(menu.key, item);
                          }}
                        >
                          <span>{item.label}</span>
                          {item.shortcut ? <span className="top-menu-dropdown-shortcut">{item.shortcut}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {hasProject && currentProject?.name ? <div className="topbar-project-name">{currentProject.name}</div> : null}

        {appMeta ? (
          <div className="topbar-runtime-meta">
            <span>{appMeta.name}</span>
            <span>v{appMeta.version}</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default TopMenuBar;
