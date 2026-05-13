export type AppTabId = 'custom';

export interface AppTab {
  id: AppTabId;
  label: string;
  order: number;
}

export interface AppShellConfig {
  title: string;
  sidebarBrand: string;
}

export const APP_SHELL_CONFIG: AppShellConfig = {
  title: 'Config',
  sidebarBrand: 'Config'
};

export const APP_TABS: AppTab[] = [
  { id: 'custom', label: '自定义', order: 10 }
];
