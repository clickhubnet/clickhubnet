export type ApiSuccess<T> = {
  status: "success";
  message: string;
  data: T;
  timestamp: string;
};

export type ApiFailure = {
  status: "error";
  message: string;
  code: string;
  details?: unknown;
  timestamp: string;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
