export interface ApiResponseDto<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorDto {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  path: string;
}
