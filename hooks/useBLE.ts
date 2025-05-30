"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Alert } from "react-native";
import type {
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

  const initializeBLE = useCallback(() => {
    stateSubscriptionRef.current = bleManager.onStateChange((state: State) => {
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
    }, true);
  }, [bleManager]);

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

  const sendEnterRoomAPI = useCallback(
    async (device: ConnectedDevice): Promise<void> => {
      try {
        const apiData = createAPIData(device);
        const response = await apiService.current.sendEnterRoom(apiData);
        if (response.success) {
          console.log("✅ 在室API送信成功");
        } else {
          console.error("❌ 在室API送信失敗:", response.message);
        }
      } catch (error) {
        console.error("❌ 在室API送信エラー:", error);
      }
    },
    [createAPIData]
  );

  const sendExitRoomAPI = useCallback(
    async (device?: ConnectedDevice): Promise<void> => {
      try {
        const apiData = createAPIData(device);
        const response = await apiService.current.sendExitRoom(apiData);
        if (response.success) {
          console.log("✅ 退室API送信成功");
        } else {
          console.error("❌ 退室API送信失敗:", response.message);
        }
      } catch (error) {
        console.error("❌ 退室API送信エラー:", error);
      }
    },
    [createAPIData]
  );

  const startScanning = useCallback(() => {
    if (!permissionsGranted || scanStatus === "スキャン中") return;

    setScanStatus("スキャン中");
    setDiscoveredDevices([]);
    console.log("🔍 BLEスキャンを開始...");

    bleManager.startDeviceScan(
      null,
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

          // ビーコン判定
          const isTargetBeacon = device.name.toLowerCase().includes("beacon");

          if (isTargetBeacon) {
            console.log("🎯 ターゲットビーコン発見:", device.name);
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
    }, config.scanTimeout);
  }, [permissionsGranted, scanStatus, bleManager, config]);

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
          }, config.reconnectDelay);
        });
      } catch (error) {
        console.error("❌ 接続エラー:", error);
        setConnectionStatus("未接続");

        reconnectTimeoutRef.current = setTimeout(() => {
          if (permissionsGranted) startScanning();
        }, config.reconnectDelay);
      }
    },
    [bleManager, sendEnterRoomAPI, sendExitRoomAPI, permissionsGranted, config]
  );

  const restartScanning = useCallback(() => {
    cleanup();
    setTimeout(() => startScanning(), 1000);
  }, [cleanup, startScanning]);

  return {
    isConnected,
    connectedDevice,
    connectionStatus,
    scanStatus,
    discoveredDevices,
    startScanning,
    restartScanning,
  };
};
