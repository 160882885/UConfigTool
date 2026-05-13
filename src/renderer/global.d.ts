import type { AppApi } from '../../shared/contracts';

export {};

declare global {
  interface Window {
    appApi: AppApi;
  }
}
