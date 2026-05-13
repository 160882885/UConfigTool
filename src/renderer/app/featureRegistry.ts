import type { ComponentType } from 'react';

import type { AppTab, AppTabId } from './config';
import { APP_TABS } from './config';
import CustomPage from '../features/custom/CustomPage';

interface FeatureManifestItem {
  id: AppTabId;
  component: ComponentType;
}

const FEATURE_COMPONENTS: FeatureManifestItem[] = [
  { id: 'custom', component: CustomPage }
];

function buildFeatureMap(): Record<AppTabId, ComponentType> {
  const map = {} as Record<AppTabId, ComponentType>;

  for (const item of FEATURE_COMPONENTS) {
    map[item.id] = item.component;
  }

  return map;
}

function getOrderedTabs(): AppTab[] {
  return [...APP_TABS].sort((a, b) => a.order - b.order);
}

const TAB_PAGE_REGISTRY = buildFeatureMap();

export {
  getOrderedTabs,
  TAB_PAGE_REGISTRY
};
