export interface AppConfig {
  serviceUUIDs: string[];
  apiBaseURL: string;
  userId: string;
  scanTimeout: number;
  reconnectDelay: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  serviceUUIDs: ["27ADC9CA-35EB-465A-9154-B8FF9076F3E8"],
  apiBaseURL: "https://www.kyutech-4lab.com/localabo/attendance",
  userId: "cm9e2syr60000jo04miuh46mp",
  scanTimeout: 10000,
  reconnectDelay: 2000,
};

export const BLE_CONSTANTS = {
  SCAN_TIMEOUT: 10000,
  RECONNECT_DELAY: 2000,
  MAX_RETRY_ATTEMPTS: 3,
  RSSI_THRESHOLD: -80,
} as const;

export const API_ENDPOINTS = {
  ENTER_ROOM: "/room/enter",
  EXIT_ROOM: "/room/exit",
  HEALTH_CHECK: "/health",
} as const;
