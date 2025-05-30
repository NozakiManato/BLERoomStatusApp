export interface RoomStatusAPI {
  userId: string;
  timestamp: string;
  deviceId?: string | undefined;
  deviceName?: string | undefined;
  rssi?: number | undefined;
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
