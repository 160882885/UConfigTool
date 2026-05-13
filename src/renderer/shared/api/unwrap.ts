import type { ApiResult } from '../../../../shared/contracts';

import { getErrorMessage } from './error';

async function unwrapApiResult<TData>(promise: Promise<ApiResult<TData>>): Promise<TData> {
  const result = await promise;
  if (result.ok) {
    return result.data;
  }

  // 将标准化错误结果转为异常，简化调用侧 async/await 控制流。
  throw new Error(getErrorMessage(result));
}

export {
  unwrapApiResult
};
