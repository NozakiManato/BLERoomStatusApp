// ★ React とフック、必要な型をインポート
import { useState, useEffect, useCallback, useRef } from "react";
// ★ react-native-ble-plx からクラスと型をインポート
import {
  BleManager,
  Device as BLEDevice, // ★ 型として使うためにエイリアスを設定
  State,
  Subscription,
  BleError,
} from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
// ★ バックグラウンドタスクのヘルパー関数をインポート
import {
  registerBackgroundBLETask,
  unregisterBackgroundBLETask,
} from "../services/backgroundBLETask";

// ★ 接続状態を表す型エイリアスを定義
type ConnectionStatus =
  | "未接続"
  | "接続中"
  | "エラー"
  | "スキャン中"
  | "デバイス発見";

// ★ 接続時刻を含む拡張デバイス情報の型を定義
interface ConnectedDeviceInfo {
  device: BLEDevice;
  connectionTime: string;
  rssi?: number;
}

// ★ フックのプロパティの型を定義
interface UseBLEProps {
  permissionsGranted: boolean;
  bleManager: BleManager;
}

// ★ フックが返す値の型を定義
interface UseBLEReturn {
  isConnected: boolean;
  connectedDevice: BLEDevice | null;
  connectedDeviceInfo: ConnectedDeviceInfo | null;
  connectionStatus: ConnectionStatus;
  findAndConnect: (
    targetDeviceName: string,
    serviceUUID: string
  ) => Promise<void>;
  disconnect: () => Promise<void>;
}

export const useBLE = ({
  permissionsGranted,
  bleManager,
}: UseBLEProps): UseBLEReturn => {
  // ★ フックのプロパティと戻り値に型を適用
  // ★ useState にジェネリクスで型を指定
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedDevice, setConnectedDevice] = useState<BLEDevice | null>(
    null
  );
  const [connectedDeviceInfo, setConnectedDeviceInfo] =
    useState<ConnectedDeviceInfo | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("未接続");

  // ★ useRef にジェネリクスで型を指定
  const disconnectSubscriptionRef = useRef<Subscription | null>(null);

  useEffect(() => {
    // ★ 権限がない場合はタスクを解除して、ここで処理を終了させる
    if (!permissionsGranted) {
      unregisterBackgroundBLETask();
      return; // クリーンアップするものがないので、ここでリターン
    }

    // --- 以下は権限がある場合の処理 ---
    registerBackgroundBLETask();

    // アプリがフォアグラウンドにある時のための状態監視
    const stateSubscription = bleManager.onStateChange((state: State) => {
      if (state === State.PoweredOn) {
        // フォアグラウンドでの初期スキャンなどが必要な場合はここに記述
        console.log("Foreground: Bluetooth is on.");
      }
    }, true);

    // ★ useEffectの最後にクリーンアップ関数をまとめて返す
    // この部分は権限がある場合にのみ到達する
    return () => {
      console.log("Cleaning up BLE effect...");
      stateSubscription.remove();
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
      }
    };
  }, [permissionsGranted, bleManager]);

  // ★ アプリ起動時に前回の接続情報を復元する処理を追加
  useEffect(() => {
    const restoreConnectionInfo = async () => {
      if (!permissionsGranted) return;

      try {
        const lastDeviceId = await AsyncStorage.getItem(
          "lastConnectedDeviceId"
        );
        const lastConnectionTime = await AsyncStorage.getItem(
          "lastConnectionTime"
        );

        if (lastDeviceId && lastConnectionTime) {
          // デバイスが実際に接続されているかチェック
          const isDeviceConnected = await bleManager.isDeviceConnected(
            lastDeviceId
          );

          if (isDeviceConnected) {
            // 接続されている場合は状態を復元
            const connectedDevices = await bleManager.connectedDevices([]);
            const device = connectedDevices.find((d) => d.id === lastDeviceId);

            if (device) {
              setIsConnected(true);
              setConnectedDevice(device);
              if (typeof device.rssi === "number") {
                setConnectedDeviceInfo({
                  device,
                  connectionTime: lastConnectionTime,
                  rssi: device.rssi,
                });
              } else {
                setConnectedDeviceInfo({
                  device,
                  connectionTime: lastConnectionTime,
                });
              }
              setConnectionStatus("接続中");

              console.log(
                `🔄 Restored connection to ${device.name} (connected at ${lastConnectionTime})`
              );

              // 切断監視を再設定
              disconnectSubscriptionRef.current = device.onDisconnected(() => {
                setIsConnected(false);
                setConnectedDevice(null);
                setConnectedDeviceInfo(null);
                setConnectionStatus("未接続");
                console.log("🔌 Foreground: Device disconnected.");
              });
            }
          } else {
            // 接続されていない場合は保存された情報をクリア
            await AsyncStorage.removeItem("lastConnectedDeviceId");
            await AsyncStorage.removeItem("lastConnectionTime");
          }
        }
      } catch (error) {
        console.error("❌ Error restoring connection info:", error);
      }
    };

    restoreConnectionInfo();
  }, [permissionsGranted, bleManager]);

  // ★ 汎用的な接続関数 (手動接続用)
  const findAndConnect = useCallback(
    // ★ 関数のパラメータと戻り値の型を明記
    async (targetDeviceName: string, serviceUUID: string): Promise<void> => {
      setConnectionStatus("スキャン中");
      bleManager.startDeviceScan(
        [serviceUUID],
        null,
        async (error: BleError | null, device: BLEDevice | null) => {
          // ★ errorとdeviceに型を適用
          if (error || !device) {
            console.error("Scan error:", error);
            setConnectionStatus("エラー");
            return;
          }

          if (device.name === targetDeviceName) {
            bleManager.stopDeviceScan();
            setConnectionStatus("デバイス発見");

            try {
              const connected = await device.connect();
              const connectionTime = new Date().toISOString();

              setConnectionStatus("接続中");
              setIsConnected(true);
              setConnectedDevice(connected);

              // ★ 接続時刻を含む詳細情報を設定
              const deviceInfo: ConnectedDeviceInfo =
                typeof device.rssi === "number"
                  ? { device: connected, connectionTime, rssi: device.rssi }
                  : { device: connected, connectionTime };
              setConnectedDeviceInfo(deviceInfo);

              await AsyncStorage.setItem("lastConnectedDeviceId", connected.id);
              await AsyncStorage.setItem("lastConnectionTime", connectionTime);

              console.log(
                `✅ Connected to ${connected.name} at ${connectionTime}`
              );

              // フォアグラウンドでの切断を監視
              disconnectSubscriptionRef.current = connected.onDisconnected(
                () => {
                  setIsConnected(false);
                  setConnectedDevice(null);
                  setConnectedDeviceInfo(null);
                  setConnectionStatus("未接続");
                  console.log("🔌 Foreground: Device disconnected.");
                }
              );
            } catch (e: any) {
              console.error("❌ Connection error in foreground:", e);
              setConnectionStatus("エラー");
            }
          }
        }
      );
    },
    [bleManager]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    // ★ 戻り値の型を明記
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        // UIの状態を即時更新
        setIsConnected(false);
        setConnectedDevice(null);
        setConnectedDeviceInfo(null);
        setConnectionStatus("未接続");

        // AsyncStorageからも削除
        await AsyncStorage.removeItem("lastConnectionTime");

        console.log("🔌 Device disconnected manually");
      } catch (error: any) {
        console.error("❌ Disconnect error:", error);
      }
    }
  }, [connectedDevice]);

  return {
    isConnected,
    connectedDevice,
    connectedDeviceInfo,
    connectionStatus,
    findAndConnect,
    disconnect,
  };
};
