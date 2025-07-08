import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import {
  BleManager,
  Device as BLEDevice,
  State,
  Subscription,
} from "react-native-ble-plx";
import type {
  Device,
  ConnectedDevice,
  ConnectionStatus,
  ScanStatus,
} from "../types";
import type { AppConfig } from "../constants";
import { BLE_CONSTANTS } from "../constants";
import { ApiService } from "../services";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface UseBLEProps {
  config: AppConfig;
  permissionsGranted: boolean;
  bleManager: BleManager;
}

export const useBLE = ({
  config,
  permissionsGranted,
  bleManager,
}: UseBLEProps) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedDevice, setConnectedDevice] =
    useState<ConnectedDevice | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("未接続");
  const [scanStatus, setScanStatus] = useState<ScanStatus>("スキャン停止");
  const [discoveredDevices, setDiscoveredDevices] = useState<Device[]>([]);
  const [lastConnectedDeviceId, setLastConnectedDeviceId] = useState<
    string | null
  >(null);

  const apiService = useRef(new ApiService(config.apiBaseURL));
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateSubscriptionRef = useRef<Subscription | null>(null);
  const discoveredDevicesRef = useRef<Device[]>([]);
  const disconnectSubscriptionRef = useRef<Subscription | null>(null);
  const isConnectingRef = useRef(false);
  const connectedBLEDeviceRef = useRef<BLEDevice | null>(null);

  useEffect(() => {
    if (permissionsGranted) {
      initializeBLE();
    }
    return () => cleanup();
  }, [permissionsGranted]);

  useEffect(() => {
    (async () => {
      const savedId = await AsyncStorage.getItem("lastConnectedDeviceId");
      if (savedId) setLastConnectedDeviceId(savedId);
    })();
  }, []);

  const cleanup = useCallback(() => {
    console.log("🧹 クリーンアップ開始");

    // タイマーのクリーンアップ
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // 購読のクリーンアップ
    if (stateSubscriptionRef.current) {
      stateSubscriptionRef.current.remove();
      stateSubscriptionRef.current = null;
    }
    if (disconnectSubscriptionRef.current) {
      disconnectSubscriptionRef.current.remove();
      disconnectSubscriptionRef.current = null;
    }

    // スキャン停止
    try {
      bleManager.stopDeviceScan();
    } catch (error) {
      console.warn("⚠️ スキャン停止エラー:", error);
    }

    // フラグのリセット
    isConnectingRef.current = false;
    connectedBLEDeviceRef.current = null;

    console.log("🧹 クリーンアップ完了");
  }, [bleManager]);

  const waitForBluetoothOn = async (): Promise<State> => {
    let state = await bleManager.state();
    const maxAttempts = 5;
    let attempts = 0;

    while (state !== State.PoweredOn && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 500));
      state = await bleManager.state();
      attempts++;
    }

    return state;
  };

  const createAPIData = useCallback(
    () => ({
      userId: config.userId,
    }),
    [config.userId]
  );

  const withRetry = useCallback(
    async (
      apiCall: () => Promise<{ success: boolean; message?: string }>
    ): Promise<void> => {
      let attempts = 0;
      while (attempts < BLE_CONSTANTS.MAX_RETRY_ATTEMPTS) {
        try {
          const response = await apiCall();
          if (response.success) {
            console.log(`✅ API呼び出し成功 (試行 ${attempts + 1}回目)`);
            return;
          } else {
            console.warn(
              `⚠️ API呼び出し失敗: ${response.message} (試行 ${
                attempts + 1
              }回目)`
            );
          }
        } catch (error) {
          console.error(
            `❌ API呼び出しで例外発生 (試行 ${attempts + 1}回目):`,
            error
          );
        }
        attempts++;
        if (attempts < BLE_CONSTANTS.MAX_RETRY_ATTEMPTS) {
          console.log(`${BLE_CONSTANTS.API_RETRY_DELAY}ms後に再試行します...`);
          await new Promise((resolve) =>
            setTimeout(resolve, BLE_CONSTANTS.API_RETRY_DELAY)
          );
        }
      }
      console.error(
        `❌ API呼び出しが${BLE_CONSTANTS.MAX_RETRY_ATTEMPTS}回失敗しました。`
      );
      Alert.alert("APIエラー", "サーバーへのデータ送信に失敗しました。");
    },
    []
  );

  const sendEnterRoomAPI = useCallback(async (): Promise<void> => {
    const apiData = createAPIData();
    await withRetry(() =>
      apiService.current.sendEnterRoom(apiData).then((res) => ({
        success: res.success,
        message: res.message ?? "",
      }))
    );
  }, [createAPIData, withRetry]);

  const sendExitRoomAPI = useCallback(async (): Promise<void> => {
    const apiData = createAPIData();
    await withRetry(() =>
      apiService.current.sendExitRoom(apiData).then((res) => ({
        success: res.success,
        message: res.message ?? "",
      }))
    );
  }, [createAPIData, withRetry]);

  // 切断処理（手動・自動共通）
  const performDisconnect = useCallback(
    async (isManual: boolean = true): Promise<void> => {
      try {
        console.log(`🔌 切断処理開始 (${isManual ? "手動" : "自動"}切断)`);

        // 切断リスナーを削除（重複処理を防ぐため）
        if (disconnectSubscriptionRef.current) {
          disconnectSubscriptionRef.current.remove();
          disconnectSubscriptionRef.current = null;
        }

        // 状態を更新
        setIsConnected(false);
        setConnectedDevice(null);
        setConnectionStatus("未接続");

        // BLE接続を切断
        if (connectedBLEDeviceRef.current) {
          const isDeviceConnected =
            await connectedBLEDeviceRef.current.isConnected();
          if (isDeviceConnected) {
            await connectedBLEDeviceRef.current.cancelConnection();
            console.log("✅ BLE接続を正常に切断しました");
          } else {
            console.log("ℹ️ デバイスは既に切断されています");
          }
          connectedBLEDeviceRef.current = null;
        }

        // API呼び出し
        await sendExitRoomAPI();

        // 自動切断の場合のみ再接続を試行
        if (!isManual && permissionsGranted) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("🔄 自動切断後の再スキャン開始");
            startScanning();
          }, BLE_CONSTANTS.RECONNECT_DELAY);
        }

        console.log("✅ 切断処理完了");
      } catch (error) {
        console.error("❌ 切断処理中にエラー:", error);
      }
    },
    [sendExitRoomAPI, permissionsGranted]
  );

  const connectToDevice = useCallback(
    async (device: Device): Promise<void> => {
      if (isConnectingRef.current || isConnected) {
        console.log(
          "ℹ️ 接続処理が進行中か、すでに接続済みのためスキップします。"
        );
        return;
      }

      isConnectingRef.current = true;
      setConnectionStatus("接続試行中");
      console.log("🔗 デバイス接続開始:", device.name);

      // 以前の購読を清理
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
        disconnectSubscriptionRef.current = null;
      }

      try {
        const bleDevice = await bleManager.connectToDevice(device.id, {
          timeout: BLE_CONSTANTS.CONNECTION_TIMEOUT,
        });

        // デバイス参照を保存
        connectedBLEDeviceRef.current = bleDevice;

        // サービス・キャラクタリスティックを発見
        await bleDevice.discoverAllServicesAndCharacteristics();

        // スキャンを停止
        bleManager.stopDeviceScan();

        isConnectingRef.current = false;
        console.log("✅ デバイス接続成功:", device.name);

        const connectedDeviceInfo: ConnectedDevice = {
          ...device,
          isConnected: true,
          connectionTime: new Date(),
        };

        setConnectedDevice(connectedDeviceInfo);
        setIsConnected(true);
        setConnectionStatus("接続中");

        await AsyncStorage.setItem("lastConnectedDeviceId", device.id);
        setLastConnectedDeviceId(device.id);
        await sendEnterRoomAPI();

        // 切断リスナーを登録（react-native-ble-plxが自動的に接続状態を管理）
        disconnectSubscriptionRef.current = bleDevice.onDisconnected(
          (error) => {
            console.log(
              "🔌 デバイス切断イベント:",
              device.name,
              "エラー:",
              error
            );

            // 現在接続中でない場合は処理をスキップ
            if (!isConnected) {
              console.log(
                "ℹ️ すでに切断処理済みのため、重複処理は行いません。"
              );
              return;
            }

            // 自動切断として処理（意図しない切断）
            performDisconnect(false);
          }
        );
      } catch (error) {
        console.error("❌ 接続エラー:", error);
        isConnectingRef.current = false;
        setConnectionStatus("エラー");
        connectedBLEDeviceRef.current = null;

        // エラー後の再試行
        reconnectTimeoutRef.current = setTimeout(() => {
          if (permissionsGranted && !isConnected) {
            console.log("🔄 接続失敗後の自動スキャン開始");
            setConnectionStatus("未接続");
            startScanning();
          }
        }, BLE_CONSTANTS.RECONNECT_DELAY + 2000);
      }
    },
    [
      bleManager,
      sendEnterRoomAPI,
      performDisconnect,
      permissionsGranted,
      isConnected,
    ]
  );

  const startScanning = useCallback(async () => {
    if (!permissionsGranted || scanStatus === "スキャン中") return;

    try {
      const state = await bleManager.state();
      console.log("📡 現在のBluetooth状態:", state);

      if (state !== State.PoweredOn) {
        console.warn("⚠️ Bluetoothが有効ではありません:", state);
        setScanStatus("エラー");
        return;
      }

      setScanStatus("スキャン中");
      setDiscoveredDevices([]);
      discoveredDevicesRef.current = [];
      console.log("🔍 BLEスキャンを開始...");
      console.log("🎯 ターゲットデバイス名:", config.targetDeviceName);
      console.log("🔧 サービスUUID:", config.serviceUUIDs);

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      bleManager.startDeviceScan(
        config.serviceUUIDs && config.serviceUUIDs.length > 0
          ? config.serviceUUIDs
          : ["0000180a-0000-1000-8000-00805f9b34fb"],
        { allowDuplicates: false },
        (error, device: BLEDevice | null) => {
          if (error) {
            console.error("❌ スキャンエラー詳細:", {
              message: error.message,
              errorCode: error.errorCode,
              reason: error.reason,
            });
            setScanStatus("エラー");
            return;
          }

          if (device) {
            const deviceName = device.name || device.localName;
            console.log("📱 デバイス発見:", {
              id: device.id,
              name: device.name,
              localName: device.localName,
              finalName: deviceName,
              rssi: device.rssi,
              serviceUUIDs: device.serviceUUIDs,
              manufacturerData: device.manufacturerData ? "あり" : "なし",
            });

            if (deviceName) {
              const deviceInfo: Device = {
                id: device.id,
                name: deviceName,
                rssi: device.rssi || undefined,
                serviceUUIDs: device.serviceUUIDs || undefined,
              };

              const exists = discoveredDevicesRef.current.find(
                (d) => d.id === device.id
              );
              if (!exists) {
                discoveredDevicesRef.current.push(deviceInfo);
              }

              const isTargetDevice =
                deviceName === config.targetDeviceName ||
                deviceName
                  .toLowerCase()
                  .includes(config.targetDeviceName.toLowerCase()) ||
                config.targetDeviceName
                  .toLowerCase()
                  .includes(deviceName.toLowerCase());

              if (isTargetDevice) {
                console.log("🎯 ターゲットデバイス発見:", deviceName);
                bleManager.stopDeviceScan();
                if (scanTimeoutRef.current) {
                  clearTimeout(scanTimeoutRef.current);
                }
                setScanStatus("デバイス発見");

                setTimeout(() => {
                  connectToDevice(deviceInfo);
                }, 1000);
                return;
              }
            }

            if (
              device.serviceUUIDs &&
              device.serviceUUIDs.some(
                (uuid) =>
                  uuid.toLowerCase() === "0000180a-0000-1000-8000-00805f9b34fb"
              )
            ) {
              console.log("🎯 サービスUUIDで自動接続");
              const deviceInfo: Device = {
                id: device.id,
                name: deviceName || "Unknown Device",
                rssi: device.rssi || undefined,
                serviceUUIDs: device.serviceUUIDs || undefined,
              };
              bleManager.stopDeviceScan();
              if (scanTimeoutRef.current) {
                clearTimeout(scanTimeoutRef.current);
              }
              setScanStatus("デバイス発見");

              setTimeout(() => {
                connectToDevice(deviceInfo);
              }, 1000);
              return;
            }
          }
        }
      );

      scanTimeoutRef.current = setTimeout(() => {
        console.log("⏰ スキャンタイムアウト");
        bleManager.stopDeviceScan();
        setScanStatus("タイムアウト");

        setTimeout(() => {
          if (permissionsGranted && !isConnected) {
            console.log("🔄 タイムアウト後の自動再スキャン");
            startScanning();
          }
        }, 2000);
      }, BLE_CONSTANTS.SCAN_TIMEOUT);
    } catch (error) {
      console.error("❌ スキャン開始エラー:", error);
      setScanStatus("エラー");
    }
  }, [
    permissionsGranted,
    scanStatus,
    bleManager,
    config.targetDeviceName,
    config.serviceUUIDs,
    connectToDevice,
    isConnected,
  ]);

  const initializeBLE = useCallback(() => {
    const setup = async () => {
      try {
        console.log("🚀 BLE初期化開始");
        const state = await waitForBluetoothOn();
        console.log("📡 最終的なBluetooth状態:", state);

        if (state === State.PoweredOn) {
          console.log("✅ Bluetooth準備完了 - スキャン開始");
          startScanning();
        } else {
          console.warn("⚠️ Bluetooth が PoweredOn になりませんでした:", state);
          Alert.alert("Bluetooth未接続", "Bluetoothを有効にしてください。");
          setScanStatus("エラー");
        }

        stateSubscriptionRef.current = bleManager.onStateChange(
          (newState: State) => {
            console.log("📶 BLE状態変更:", newState);

            switch (newState) {
              case State.PoweredOn:
                console.log("✅ Bluetooth有効化 - スキャン開始");
                if (!isConnected) {
                  startScanning();
                }
                break;
              case State.PoweredOff:
                console.log("❌ Bluetooth無効化");
                Alert.alert("Bluetooth無効", "Bluetoothを有効にしてください。");
                setScanStatus("エラー");
                break;
              default:
                console.log("⚠️ Bluetooth状態:", newState);
                setScanStatus("エラー");
                break;
            }
          },
          true
        );
      } catch (error) {
        console.error("❌ BLE初期化エラー:", error);
        setScanStatus("エラー");
      }
    };

    setup();
  }, [bleManager, startScanning, isConnected]);

  const restartScanning = useCallback(() => {
    cleanup();
    setTimeout(() => startScanning(), 1000);
  }, [cleanup, startScanning]);

  // 手動切断関数
  const disconnect = useCallback(async () => {
    if (connectedBLEDeviceRef.current) {
      console.log("🔌 手動切断開始");
      await performDisconnect(true);
      cleanup();
    }
  }, [performDisconnect, cleanup]);

  // 自動再接続
  useEffect(() => {
    if (
      scanStatus === "スキャン中" &&
      lastConnectedDeviceId &&
      discoveredDevices.length > 0
    ) {
      const found = discoveredDevices.find(
        (d) => d.id === lastConnectedDeviceId
      );
      if (found) {
        console.log("🔄 前回接続デバイスを発見 - 自動接続:", found.name);
        connectToDevice(found);
      }
    }
  }, [scanStatus, lastConnectedDeviceId, discoveredDevices, connectToDevice]);

  // デバイス一覧の定期更新
  useEffect(() => {
    const interval = setInterval(() => {
      setDiscoveredDevices([...discoveredDevicesRef.current]);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return {
    isConnected,
    connectedDevice,
    connectionStatus,
    scanStatus,
    discoveredDevices,
    startScanning,
    restartScanning,
    disconnect,
    permissionsGranted,
    connectToDevice,
  };
};
