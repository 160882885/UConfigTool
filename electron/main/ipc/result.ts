import type { ApiFailure, ApiResult, ApiSuccess } from '../../../shared/contracts';

function ok<TData>(data: TData): ApiSuccess<TData> {
  return {
    ok: true,
    data
  };
}

function fail(code: string, message: string): ApiFailure {
  return {
    ok: false,
    code,
    message
  };
}

function failFromUnknown(error: unknown, defaultCode = 'UNEXPECTED_ERROR'): ApiFailure {
  if (error instanceof Error) {
    return fail(defaultCode, error.message);
  }

  return fail(defaultCode, 'Unknown error');
}

// 包装所有 IPC handler 的统一返回结构。
async function wrapIpc<TData>(handler: () => Promise<TData> | TData): Promise<ApiResult<TData>> {
  try {
    return ok(await handler());
  } catch (error) {
    return failFromUnknown(error);
  }
}

export {
  fail,
  failFromUnknown,
  ok,
  wrapIpc
};
