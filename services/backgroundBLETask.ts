import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { Device, BleError } from "react-native-ble-plx";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiService } from "./ApiServices";
import { DEFAULT_CONFIG } from "../constants";
import bleManager from "./bleManagerSingleton";

export const BACKGROUND_BLE_TASK: string = "background-ble-task";

const apiService: ApiService = new ApiService(DEFAULT_CONFIG.apiBaseURL);

let connectedDeviceId: string | null = null;
let hasSentExitAPI: boolean = true;

TaskManager.defineTask(
  BACKGROUND_BLE_TASK,
  async (): Promise<BackgroundFetch.BackgroundFetchResult> => {
    console.log(
      `⚡️ [${new Date().toISOString()}] Background BLE Task is running...`
    );
    try {
      const isConnected: boolean = connectedDeviceId
        ? await bleManager.isDeviceConnected(connectedDeviceId)
        : false;

      if (isConnected) {
        console.log("✅ Background: Already connected. Task finished.");
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      if (connectedDeviceId && !isConnected) {
        if (!hasSentExitAPI) {
          console.log(
            "🔌 Background: Device disconnected. Sending exit API..."
          );
          await apiService.sendExitRoom({ userId: DEFAULT_CONFIG.userId });
          hasSentExitAPI = true;
        }
        connectedDeviceId = null;
      }

      const lastId: string | null = await AsyncStorage.getItem(
        "lastConnectedDeviceId"
      );
      if (!lastId) {
        console.log("🔍 Background: No last connected device ID found.");
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      console.log(
        `🔍 Background: Attempting to connect to last known device: ${lastId}`
      );
      await bleManager
        .connectToDevice(lastId, { timeout: 15000 })
        .then(async (device: Device) => {
          console.log(
            `🔗 Background: Successfully connected to ${device.name}`
          );
          connectedDeviceId = device.id;

          await apiService.sendEnterRoom({ userId: DEFAULT_CONFIG.userId });
          hasSentExitAPI = false;

          device.onDisconnected(
            async (
              error: BleError | null,
              disconnectedDevice: Device | null
            ) => {
              console.log(
                `🔌 Background: Device ${disconnectedDevice?.name} disconnected.`
              );
              if (!hasSentExitAPI) {
                await apiService.sendExitRoom({
                  userId: DEFAULT_CONFIG.userId,
                });
                hasSentExitAPI = true;
              }
              connectedDeviceId = null;
            }
          );
          // 新しいデータを取得したことを示す
          return BackgroundFetch.BackgroundFetchResult.NewData;
        })
        .catch((error) => {
          console.error(
            `❌ Background: Connection attempt failed.`,
            error.reason
          );
          return BackgroundFetch.BackgroundFetchResult.Failed;
        });
    } catch (error) {
      console.error("❌ Background Task Error:", error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  }
);

export async function registerBackgroundBLETask(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_BLE_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log("✅ Background BLE Task registered successfully.");
  } catch (error) {
    console.error("❌ Failed to register background task:", error);
  }
}

export async function unregisterBackgroundBLETask(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_BLE_TASK);
    console.log("🗑️ Background BLE Task unregistered successfully.");
  } catch (error) {
    console.error("❌ Failed to unregister background task:", error);
  }
}
