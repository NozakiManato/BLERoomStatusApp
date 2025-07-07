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

export const API_ENDPOINTS = {
  ENTER_ROOM: "/enter",
  EXIT_ROOM: "/exit",
  HEALTH_CHECK: "/health",
} as const;
