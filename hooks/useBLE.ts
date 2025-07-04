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

// ★ フックのプロパティの型を定義
interface UseBLEProps {
  permissionsGranted: boolean;
  bleManager: BleManager;
}

// ★ フックが返す値の型を定義
interface UseBLEReturn {
  isConnected: boolean;
  connectedDevice: BLEDevice | null;
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
              setConnectionStatus("接続中");
              setIsConnected(true);
              setConnectedDevice(connected);
              await AsyncStorage.setItem("lastConnectedDeviceId", connected.id);

              // フォアグラウンドでの切断を監視
              disconnectSubscriptionRef.current = connected.onDisconnected(
                () => {
                  setIsConnected(false);
                  setConnectedDevice(null);
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
        setConnectionStatus("未接続");
      } catch (error: any) {
        console.error("❌ Disconnect error:", error);
      }
    }
  }, [connectedDevice]);

  return {
    isConnected,
    connectedDevice,
    connectionStatus,
    findAndConnect,
    disconnect,
  };
};
