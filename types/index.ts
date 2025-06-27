export * from "./api";

export interface Device {
  id: string;
  name: string | null;
  rssi?: number | undefined;
  serviceUUIDs?: string[] | undefined;
}

export interface ConnectedDevice extends Device {
  isConnected: boolean;
  connectionTime: Date;
}

export interface PermissionStatus {
  location: boolean;
  backgroundLocation: boolean;
  bluetooth: boolean;
  all: boolean;
}
export type RoomStatus = "在室中" | "退室中";
export type ConnectionStatus = "接続中" | "未接続" | "接続試行中";
export type ScanStatus =
  | "スキャン停止"
  | "スキャン中"
  | "エラー"
  | "デバイス発見"
  | "タイムアウト";
