import type { ApiFailure } from '../../../../shared/contracts';

function getErrorMessage(error: ApiFailure): string {
  // 统一错误文案格式，便于日志检索和排障。
  return `[${error.code}] ${error.message}`;
}

export {
  getErrorMessage
};
