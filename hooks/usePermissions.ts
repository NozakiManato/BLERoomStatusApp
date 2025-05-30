import { useEffect, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { BleManager, State } from "react-native-ble-plx";
import * as Location from "expo-location";
import type { PermissionStatus } from "../types";

export const usePermissions = () => {
  const [permissionsGranted, setPermissionsGranted] = useState<boolean>(false);
  const [bleManager] = useState<BleManager>(new BleManager());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    checkInitialPermissions();
  }, []);

  const checkInitialPermissions = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const status = await checkPermissions();
      setPermissionsGranted(status.all);
      if (status.all) {
        console.log("✅ すべての権限が許可されています");
      } else {
        console.log("❌ 権限が不足しています:", status);
      }
    } catch (error) {
      console.error("初期権限確認エラー:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermissions = async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      console.log("🔐 権限をリクエスト中...");

      // 位置情報権限をリクエスト
      const { status: locationStatus } =
        await Location.requestForegroundPermissionsAsync();

      if (locationStatus !== "granted") {
        Alert.alert(
          "位置情報権限が必要です",
          "BLEデバイスをスキャンするために位置情報権限が必要です。",
          [
            { text: "キャンセル", style: "cancel" },
            { text: "設定を開く", onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }

      //バックグラウンド位置情報権限をリクエスト(iOS)
      if (Platform.OS === "ios") {
        const { status: backgroundLocationStatus } =
          await Location.requestBackgroundPermissionsAsync();

        if (backgroundLocationStatus !== "granted") {
          Alert.alert(
            "バックグラウンド位置情報権限",
            "バックグラウンドでもBLE接続を監視するために、位置情報の「常に許可」を選択することをお勧めします。",
            [{ text: "OK" }]
          );
        }
      }

      //Bluetooth権限の確認
      const bluetoothState: State = await bleManager.state();

      if (bluetoothState !== "PoweredOn") {
        Alert.alert("Bluetoothエラー", "Bluetoothを有効にしてください。", [
          { text: "キャンセル", style: "cancel" },
          { text: "設定を開く", onPress: () => Linking.openSettings() },
        ]);
        return false;
      }
      setPermissionsGranted(true);
      console.log("✅ すべての権限が許可されました");
      return true;
    } catch (error) {
      console.error("権限リクエストエラー:", error);
      Alert.alert("エラー", "権限の取得に失敗しました。");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkPermissions = async (): Promise<PermissionStatus> => {
    try {
      const { status: locationStatus } =
        await Location.getForegroundPermissionsAsync();
      const { status: backgroundLocationStatus } =
        await Location.getBackgroundPermissionsAsync();
      const bluetoothState: State = await bleManager.state();

      const permissionStatus: PermissionStatus = {
        location: locationStatus === "granted",
        backgroundLocation: backgroundLocationStatus === "granted",
        bluetooth: bluetoothState === "PoweredOn",
        all: locationStatus === "granted" && bluetoothState === "PoweredOn",
      };
      setPermissionsGranted(permissionStatus.all);
      return permissionStatus;
    } catch (error) {
      console.error("権限確認エラー:", error);
      return {
        location: false,
        backgroundLocation: false,
        bluetooth: false,
        all: false,
      };
    }
  };
  return {
    permissionsGranted,
    isLoading,
    requestPermissions,
    checkPermissions,
    bleManager,
  };
};
