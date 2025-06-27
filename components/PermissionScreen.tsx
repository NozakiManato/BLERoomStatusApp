import type React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { PermissionStatus } from "../types";

interface PermissionScreenProps {
  isLoading: boolean;
  onRequestPermissions: () => Promise<boolean>;
  onCheckPermissions: () => Promise<PermissionStatus>;
  permissionsGranted?: boolean;
  connectionStatus?: string;
  scanStatus?: string;
}

export const PermissionScreen: React.FC<PermissionScreenProps> = ({
  isLoading,
  onRequestPermissions,
  onCheckPermissions,
  permissionsGranted,
  connectionStatus,
  scanStatus,
}) => {
  const handleCheckPermissions = async (): Promise<void> => {
    const status = await onCheckPermissions();
    const statusText = `位置情報: ${
      status.location ? "✅ 許可" : "❌ 拒否"
    }\nBluetooth: ${
      status.bluetooth ? "✅ 有効" : "❌ 無効"
    }\nバックグラウンド位置情報: ${
      status.backgroundLocation ? "✅ 許可" : "❌ 拒否"
    }`;

    Alert.alert("権限状態", statusText, [
      { text: "OK" },
      ...(status.all
        ? []
        : [{ text: "設定を開く", onPress: () => onRequestPermissions() }]),
    ]);
  };

  const handleRequestPermissions = async (): Promise<void> => {
    const success = await onRequestPermissions();
    if (!success) {
      Alert.alert(
        "権限が必要です",
        "アプリを正常に動作させるために、すべての権限を許可してください。",
        [{ text: "OK" }]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>権限を確認中...</Text>
        <Text style={{ marginTop: 10 }}>
          権限:{" "}
          {permissionsGranted === undefined
            ? "-"
            : permissionsGranted
            ? "許可済み"
            : "未許可"}
        </Text>
        <Text>BLE接続状態: {connectionStatus ?? "-"}</Text>
        <Text>スキャン状態: {scanStatus ?? "-"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={{ marginBottom: 16 }}>
        <Text>
          権限:{" "}
          {permissionsGranted === undefined
            ? "-"
            : permissionsGranted
            ? "許可済み"
            : "未許可"}
        </Text>
        <Text>BLE接続状態: {connectionStatus ?? "-"}</Text>
        <Text>スキャン状態: {scanStatus ?? "-"}</Text>
      </View>
      <Text style={styles.title}>🔐 BLE Room Status Monitor</Text>
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>権限設定が必要です</Text>
        <Text style={styles.permissionText}>
          このアプリを使用するには以下の権限が必要です：{"\n\n"}📶 Bluetooth権限
          {"\n"}📍 位置情報権限{"\n"}🔄 バックグラウンド実行権限（推奨）
        </Text>

        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>📋 設定手順:</Text>
          <Text style={styles.stepText}>
            1. 「権限を許可」ボタンをタップ{"\n"}
            2. 位置情報の許可を選択{"\n"}
            3. Bluetoothが有効になっていることを確認{"\n"}
            4. バックグラウンド位置情報で「常に許可」を選択（推奨）
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            styles.primaryButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleRequestPermissions}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "処理中..." : "🔐 権限を許可"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            styles.secondaryButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleCheckPermissions}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📊 権限状態を確認</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 30,
    color: "#333",
  },
  loadingText: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  permissionContainer: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
    textAlign: "center",
  },
  permissionText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 22,
    marginBottom: 20,
  },
  stepContainer: {
    backgroundColor: "#f8f9fa",
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  stepText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  primaryButton: {
    backgroundColor: "#2196F3",
  },
  secondaryButton: {
    backgroundColor: "#FF9800",
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "bold",
  },
});
