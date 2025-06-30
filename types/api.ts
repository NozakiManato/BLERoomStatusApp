export interface RoomStatusAPI {
  userId: string;
}

export interface APIResponse {
  success: boolean;
  message?: string | undefined;
  data?: any;
}

export interface APIError {
  code: number;
  message: string;
  details?: any;
}
