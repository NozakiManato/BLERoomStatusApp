export interface AppConfig {
  serviceUUIDs: string[];
  targetDeviceName: string;
  apiBaseURL: string;
  userId: string;
  scanTimeout: number;
  reconnectDelay: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  serviceUUIDs: ["0000180a-0000-1000-8000-00805f9b34fb"],
  targetDeviceName: "LINBLE-Z2",
  apiBaseURL: "https://www.kyutech-4lab.jp/api/attendance",
  userId: "",
  scanTimeout: 10000,
  reconnectDelay: 2000,
};

export const BLE_CONSTANTS = {
  SCAN_TIMEOUT: 20000,
  RECONNECT_DELAY: 3000,
  MAX_RETRY_ATTEMPTS: 3,
  API_RETRY_DELAY: 2000,
  RSSI_THRESHOLD: -100,
  CONNECTION_TIMEOUT: 15000,
} as const;

export const API_ENDPOINTS = {
  ENTER_ROOM: "/enter",
  EXIT_ROOM: "/exit",
  HEALTH_CHECK: "/health",
} as const;
