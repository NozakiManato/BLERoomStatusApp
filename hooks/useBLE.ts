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
  // ★ 追加: 切断リスナーと接続試行中のフラグを管理するref
  const disconnectSubscriptionRef = useRef<Subscription | null>(null);
  const isConnectingRef = useRef(false);

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

  // ★ 修正: cleanup関数を強化
  const cleanup = useCallback(() => {
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (stateSubscriptionRef.current) stateSubscriptionRef.current.remove();
    // ★ 切断リスナーも確実に解除
    if (disconnectSubscriptionRef.current) {
      disconnectSubscriptionRef.current.remove();
      disconnectSubscriptionRef.current = null;
    }
    bleManager.stopDeviceScan();
    isConnectingRef.current = false; // ★ 接続フラグをリセット
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

  const connectToDevice = useCallback(
    async (device: Device): Promise<void> => {
      // ★ すでに接続処理が進行中か、接続済みの場合は処理を中断
      if (isConnectingRef.current || isConnected) {
        console.log(
          "ℹ️ 接続処理が進行中か、すでに接続済みのためスキップします。"
        );
        return;
      }

      isConnectingRef.current = true; // ★ 接続試行開始のフラグを立てる
      setConnectionStatus("接続試行中");
      console.log("🔗 デバイス接続開始:", device.name);

      // ★ 以前の切断リスナーが残っていれば解除
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
        disconnectSubscriptionRef.current = null;
      }

      try {
        const bleDevice = await bleManager.connectToDevice(device.id, {
          // ★ タイムアウトを設定
          timeout: BLE_CONSTANTS.CONNECTION_TIMEOUT,
        });

        // サービス・キャラクタリスティックを発見
        await bleDevice.discoverAllServicesAndCharacteristics();
        // スキャンを停止
        bleManager.stopDeviceScan();

        isConnectingRef.current = false; // ★ 接続成功したのでフラグを下ろす
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

        // ★ 追加: 距離による自動切断監視タイマー
        let rssiMonitorInterval: NodeJS.Timeout | null = null;
        const startRssiMonitor = () => {
          if (rssiMonitorInterval) clearInterval(rssiMonitorInterval);
          rssiMonitorInterval = setInterval(async () => {
            try {
              const updatedDevice = await bleManager.connectedDevices([
                device.id,
              ]);
              if (updatedDevice && updatedDevice.length > 0) {
                const dev = updatedDevice[0];
                if (typeof dev.rssi === "number") {
                  console.log("📶 RSSI監視:", dev.rssi);
                  if (dev.rssi < BLE_CONSTANTS.RSSI_THRESHOLD) {
                    console.warn(
                      "⚠️ RSSIがしきい値を下回ったため自動切断:",
                      dev.rssi
                    );
                    if (rssiMonitorInterval) clearInterval(rssiMonitorInterval);
                    await disconnect(); // 既存のdisconnect関数を利用
                  }
                } else {
                  // RSSI取得できない場合も切断（オプション）
                  console.warn(
                    "⚠️ RSSI値が取得できませんでした。自動切断します。"
                  );
                  if (rssiMonitorInterval) clearInterval(rssiMonitorInterval);
                  await disconnect();
                }
              } else {
                // デバイスが見つからない場合も切断
                console.warn("⚠️ デバイスが見つかりません。自動切断します。");
                if (rssiMonitorInterval) clearInterval(rssiMonitorInterval);
                await disconnect();
              }
            } catch (e) {
              console.error("❌ RSSI監視中にエラー:", e);
              if (rssiMonitorInterval) clearInterval(rssiMonitorInterval);
              await disconnect();
            }
          }, 3000); // 3秒ごとにRSSI監視
        };
        startRssiMonitor();

        // ★ 切断リスナーを登録し、その購読をrefに保存
        disconnectSubscriptionRef.current = bleDevice.onDisconnected(
          (error) => {
            console.log("🔌 デバイス切断:", device.name, "エラー:", error);

            // このコールバックは手動切断でも呼ばれるため、現在の接続状態を見て判断する
            if (!isConnected) {
              console.log(
                "ℹ️ すでに切断処理済みのため、重複処理は行いません。"
              );
              return;
            }

            setIsConnected(false);
            setConnectedDevice(null);
            setConnectionStatus("未接続");
            sendExitRoomAPI();

            if (disconnectSubscriptionRef.current) {
              disconnectSubscriptionRef.current.remove();
              disconnectSubscriptionRef.current = null;
            }

            // 意図しない切断の場合のみ再スキャンを試みる
            reconnectTimeoutRef.current = setTimeout(() => {
              if (permissionsGranted) {
                console.log("🔄 切断後の自動スキャン開始");
                startScanning();
              }
            }, BLE_CONSTANTS.RECONNECT_DELAY);
          }
        );
      } catch (error) {
        console.error("❌ 接続エラー:", error);
        isConnectingRef.current = false; // ★ 接続失敗したのでフラグを下ろす
        setConnectionStatus("エラー");

        // ★ エラー後の再試行ロジックを修正
        // UIが固まるのを防ぐため、少し長めの待機時間を設ける
        reconnectTimeoutRef.current = setTimeout(() => {
          if (permissionsGranted && !isConnected) {
            console.log("🔄 接続失敗後の自動スキャン開始");
            setConnectionStatus("未接続"); // UIの状態をリセット
            startScanning();
          }
        }, BLE_CONSTANTS.RECONNECT_DELAY + 2000); // 通常より少し長めのディレイ
      }
    },
    // ★ 依存配列を更新 (startScanning は相互依存を避けるためここでは含めず、ロジックで制御)
    [
      bleManager,
      sendEnterRoomAPI,
      sendExitRoomAPI,
      permissionsGranted,
      isConnected,
    ]
  );

  const startScanning = useCallback(async () => {
    if (!permissionsGranted || scanStatus === "スキャン中") return;

    try {
      // Bluetooth状態確認
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

      // タイムアウト設定
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
            // より詳細なログ出力
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

            // デバイス名またはlocalNameが存在する場合のみ処理
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

              // ターゲットデバイスの判定（完全一致 + 部分一致）
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

            // サービスUUIDでの判定も追加（オプション）
            if (
              device.serviceUUIDs &&
              device.serviceUUIDs.some(
                (uuid) =>
                  uuid.toLowerCase() === "0000180a-0000-1000-8000-00805f9b34fb"
              )
            ) {
              console.log(
                "🎯 0000180a-0000-1000-8000-00805f9b34fbサービスUUIDで自動接続"
              );
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

      // タイムアウト処理
      scanTimeoutRef.current = setTimeout(() => {
        console.log("⏰ スキャンタイムアウト");
        bleManager.stopDeviceScan();
        setScanStatus("タイムアウト");

        // タイムアウト後の自動再スキャン（オプション）
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

        // 状態変更の監視
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

  const disconnect = useCallback(async () => {
    if (connectedDevice) {
      try {
        console.log("🔌 手動切断開始:", connectedDevice.name);
        setConnectionStatus("未接続");
        setIsConnected(false);
        setConnectedDevice(null);
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        await sendExitRoomAPI();
        cleanup();
        console.log("✅ 手動切断完了");
      } catch (error) {
        console.error("❌ 切断エラー:", error);
      }
    }
  }, [bleManager, connectedDevice, sendExitRoomAPI, cleanup]);

  // スキャン時に自動再接続
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

  // 5秒ごとにまとめてsetState
  useEffect(() => {
    const interval = setInterval(() => {
      setDiscoveredDevices([...discoveredDevicesRef.current]);
    }, 5000); // 5秒ごと
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
