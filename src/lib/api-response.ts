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

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function successResponse<T>(message: string, data: T): ApiSuccess<T> {
  return {
    status: "success",
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function errorResponse(
  message: string,
  code = "INTERNAL_ERROR",
  details?: unknown,
): ApiFailure {
  return {
    status: "error",
    message,
    code,
    details,
    timestamp: new Date().toISOString(),
  };
}
