import { useEffect, useMemo, useState } from 'react';

import type { RuntimeBootstrap } from '../../../../shared/contracts';
import { bootstrapRuntime } from '../bootstrap/bootstrapRuntime';
import { APP_SHELL_CONFIG, type AppTabId } from '../config';
import { getOrderedTabs, TAB_PAGE_REGISTRY } from '../featureRegistry';
import SidebarTabs from '../../shared/components/SidebarTabs';
import TopMenuBar from '../../shared/components/TopMenuBar';
import { createLogger } from '../../shared/logging/logger';
import {
  setRuntimeBootstrap,
  setRuntimeError
} from '../../shared/state/runtimeState';

const logger = createLogger('renderer:AppShell');

function AppShell() {
  // 基于 manifest 生成已排序标签页，避免 UI 与配置顺序耦合。
  const tabs = useMemo(() => getOrderedTabs(), []);

  // activeTab 控制当前展示的 feature 页面。
  const [activeTab, setActiveTab] = useState<AppTabId>(tabs[0]?.id || 'custom');

  // bootstrap 持有渲染启动所需的运行时元信息与开关。
  const [bootstrap, setBootstrap] = useState<RuntimeBootstrap | null>(null);

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const nextBootstrap = await bootstrapRuntime();

        if (!active) {
          return;
        }

        setBootstrap(nextBootstrap);
        setRuntimeBootstrap(nextBootstrap);
        logger.info('Runtime bootstrap loaded', nextBootstrap);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initialize runtime bootstrap';

        if (!active) {
          return;
        }
        setRuntimeError(message);
        logger.error('Runtime bootstrap failed', error);
      }
    }

    void init();

    return () => {
      // 组件卸载时阻止异步回写，避免 React 警告。
      active = false;
    };
  }, []);

  // 若配置变化导致当前 tab 不存在，则自动回落到第一个可用 tab。
  const activeTabExists = tabs.some((tab) => tab.id === activeTab);
  const safeActiveTab = (activeTabExists ? activeTab : tabs[0]?.id) || 'custom';
  const shouldShowSidebarTabs = tabs.length > 1;

  return (
    <div className="app-shell">
      <TopMenuBar appTitle={APP_SHELL_CONFIG.title} appMeta={bootstrap?.appMeta || null} />

      <div className="workbench-main">
        {shouldShowSidebarTabs ? (
          <SidebarTabs
            title={APP_SHELL_CONFIG.sidebarBrand}
            tabs={tabs}
            activeTab={safeActiveTab as AppTabId}
            onTabChange={setActiveTab}
          />
        ) : null}

        <main className="content">
          {tabs.map((tab) => {
            const PageComponent = TAB_PAGE_REGISTRY[tab.id];
            return (
              <div key={tab.id} className={`tab-page ${safeActiveTab === tab.id ? '' : 'hidden'}`}>
                <PageComponent />
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}

export default AppShell;

