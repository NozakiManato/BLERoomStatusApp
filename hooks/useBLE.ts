"use client";

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

  const apiService = useRef(new ApiService(config.apiBaseURL));
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const stateSubscriptionRef = useRef<Subscription | null>(null);

  useEffect(() => {
    if (permissionsGranted) {
      initializeBLE();
    }
    return () => cleanup();
  }, [permissionsGranted]);

  const cleanup = useCallback(() => {
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (stateSubscriptionRef.current) stateSubscriptionRef.current.remove();
    bleManager.stopDeviceScan();
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

  const startScanning = useCallback(() => {
    if (!permissionsGranted || scanStatus === "スキャン中") return;

    setScanStatus("スキャン中");
    setDiscoveredDevices([]);
    console.log("🔍 BLEスキャンを開始...");

    bleManager.startDeviceScan(
      config.serviceUUIDs,
      null,
      (error, device: BLEDevice | null) => {
        if (error) {
          console.error("❌ スキャンエラー:", error);
          setScanStatus("エラー");
          return;
        }

        if (device && device.name) {
          const deviceInfo: Device = {
            id: device.id,
            name: device.name,
            rssi: device.rssi || undefined,
            serviceUUIDs: device.serviceUUIDs || undefined,
          };

          setDiscoveredDevices((prev) => {
            const exists = prev.find((d) => d.id === device.id);
            return exists ? prev : [...prev, deviceInfo];
          });

          // デバイス名で判定
          if (device.name === config.targetDeviceName) {
            console.log("🎯 ターゲットデバイス発見:", device.name);
            bleManager.stopDeviceScan();
            setScanStatus("スキャン停止");
            connectToDevice(deviceInfo);
          }
        }
      }
    );

    scanTimeoutRef.current = setTimeout(() => {
      bleManager.stopDeviceScan();
      setScanStatus("スキャン停止");
      console.log("⏰ スキャンタイムアウト");
    }, BLE_CONSTANTS.SCAN_TIMEOUT);
  }, [permissionsGranted, scanStatus, bleManager, config]);

  const initializeBLE = useCallback(() => {
    const setup = async () => {
      const state = await waitForBluetoothOn();

      if (state === State.PoweredOn) {
        startScanning();
      } else {
        console.warn("⚠️ Bluetooth が PoweredOn になりませんでした");
        Alert.alert("Bluetooth未接続", "Bluetoothを有効にしてください。");
      }
      stateSubscriptionRef.current = bleManager.onStateChange(
        (state: State) => {
          console.log("📶 BLE状態変更:", state);

          switch (state) {
            case "PoweredOn":
              startScanning();
              break;
            case "PoweredOff":
              Alert.alert("Bluetooth無効", "Bluetoothを有効にしてください。");
              setScanStatus("エラー");
              break;
            default:
              setScanStatus("エラー");
              break;
          }
        },
        true
      );
    };

    setup();
  }, [bleManager, startScanning]);

  const createAPIData = useCallback(
    (device?: ConnectedDevice) => ({
      userId: config.userId,
      timestamp: new Date().toISOString(),
      deviceId: device?.id,
      deviceName: device?.name || undefined,
      rssi: device?.rssi,
    }),
    [config.userId]
  );

  const withRetry = useCallback(
    async <T>(
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

  const sendEnterRoomAPI = useCallback(
    async (device: ConnectedDevice): Promise<void> => {
      const apiData = createAPIData(device);
      await withRetry(() =>
        apiService.current.sendEnterRoom(apiData).then((res) => ({
          success: res.success,
          message: res.message ?? "",
        }))
      );
    },
    [createAPIData, withRetry]
  );

  const sendExitRoomAPI = useCallback(
    async (device?: ConnectedDevice): Promise<void> => {
      const apiData = createAPIData(device);
      await withRetry(() =>
        apiService.current.sendExitRoom(apiData).then((res) => ({
          success: res.success,
          message: res.message ?? "",
        }))
      );
    },
    [createAPIData, withRetry]
  );

  const connectToDevice = useCallback(
    async (device: Device): Promise<void> => {
      try {
        setConnectionStatus("接続試行中");
        const bleDevice = await bleManager.connectToDevice(device.id);

        const connectedDeviceInfo: ConnectedDevice = {
          ...device,
          isConnected: true,
          connectionTime: new Date(),
        };

        setConnectedDevice(connectedDeviceInfo);
        setIsConnected(true);
        setConnectionStatus("接続中");

        await sendEnterRoomAPI(connectedDeviceInfo);

        bleDevice.onDisconnected(() => {
          setIsConnected(false);
          setConnectedDevice(null);
          setConnectionStatus("未接続");
          sendExitRoomAPI(connectedDeviceInfo);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (permissionsGranted) startScanning();
          }, BLE_CONSTANTS.RECONNECT_DELAY);
        });
      } catch (error) {
        console.error("❌ 接続エラー:", error);
        setConnectionStatus("未接続");

        reconnectTimeoutRef.current = setTimeout(() => {
          if (permissionsGranted) startScanning();
        }, BLE_CONSTANTS.RECONNECT_DELAY);
      }
    },
    [bleManager, sendEnterRoomAPI, sendExitRoomAPI, permissionsGranted, config]
  );

  const restartScanning = useCallback(() => {
    cleanup();
    setTimeout(() => startScanning(), 1000);
  }, [cleanup, startScanning]);

  const disconnect = useCallback(async () => {
    if (connectedDevice) {
      try {
        setConnectionStatus("未接続");
        setIsConnected(false);
        setConnectedDevice(null);
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        await sendExitRoomAPI(connectedDevice);
        cleanup();
      } catch (error) {
        console.error("❌ 切断エラー:", error);
      }
    }
  }, [bleManager, connectedDevice, sendExitRoomAPI, cleanup]);

  return {
    isConnected,
    connectedDevice,
    connectionStatus,
    scanStatus,
    discoveredDevices,
    startScanning,
    restartScanning,
    disconnect,
  };
};
