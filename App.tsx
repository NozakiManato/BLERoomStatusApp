import React, { useState, useEffect } from "react";
import { DEFAULT_CONFIG } from "./constants";
import { useBLE, usePermissions } from "./hooks";
import { RoomStatus } from "./types";
import { DeviceInfo, PermissionScreen, StatusCard } from "./components";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import {
  Appbar,
  Button,
  Provider as PaperProvider,
  TextInput,
  Dialog,
  Portal,
} from "react-native-paper";
import { SettingsScreen } from "./components/SettingsScreen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(() => DEFAULT_CONFIG);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [targetDeviceName, setTargetDeviceName] = useState("");
  const [serviceUUID, setServiceUUID] = useState("");

  const {
    permissionsGranted,
    isLoading,
    requestPermissions,
    checkPermissions,
  } = usePermissions();

  const {
    isConnected,
    connectedDeviceInfo,
    connectionStatus,
    findAndConnect,
    disconnect,
  } = useBLE({ permissionsGranted });

  const roomStatus: RoomStatus = isConnected ? "在室中" : "退室中";

  useEffect(() => {
    (async () => {
      const userId = await AsyncStorage.getItem("userId");
      if (!userId) {
        setIsFirstLaunch(true);
      } else {
        setConfig((prev) => ({
          ...prev,
          userId,
          serviceUUIDs: DEFAULT_CONFIG.serviceUUIDs,
        }));
        setIsFirstLaunch(false);
      }
    })();
  }, []);

  const handleSaveSettings = (userId: string) => {
    setConfig((prev) => ({
      ...prev,
      userId,
      serviceUUIDs: DEFAULT_CONFIG.serviceUUIDs,
    }));
    setIsFirstLaunch(false);
    setShowSettings(false);
  };

  const handleConnectPress = () => {
    if (isConnected) {
      disconnect();
    } else {
      setShowConnectionDialog(true);
    }
  };

  const handleConnect = async () => {
    if (!targetDeviceName.trim() || !serviceUUID.trim()) {
      return;
    }

    try {
      await findAndConnect(targetDeviceName.trim(), serviceUUID.trim());
      setShowConnectionDialog(false);
      setTargetDeviceName("");
      setServiceUUID("");
    } catch (error) {
      console.error("接続エラー:", error);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "接続中":
      case "在室中":
        return "#4CAF50";
      case "未接続":
      case "退室中":
        return "#F44336";
      case "接続試行中":
        return "#FF9800";
      case "スキャン中":
        return "#2196F3";
      case "デバイス発見":
        return "#9C27B0";
      case "エラー":
        return "#F44336";
      default:
        return "#757575";
    }
  };

  if (!permissionsGranted) {
    return (
      <PermissionScreen
        isLoading={isLoading}
        onRequestPermissions={requestPermissions}
        onCheckPermissions={checkPermissions}
        permissionsGranted={permissionsGranted}
        connectionStatus={connectionStatus}
      />
    );
  }

  if (isFirstLaunch || showSettings) {
    return <SettingsScreen onSave={handleSaveSettings} />;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <Appbar.Header>
            <Appbar.Content title="BLE Room Status1.0.17" />
            <Appbar.Action icon="cog" onPress={() => setShowSettings(true)} />
          </Appbar.Header>
          <ScrollView style={styles.container}>
            <StatusCard
              label="接続状態"
              value={connectionStatus}
              color={getStatusColor(connectionStatus)}
              icon="link-variant"
            />
            <StatusCard
              label="在室状態"
              value={roomStatus}
              color={getStatusColor(roomStatus)}
              icon="home-account"
            />
            <StatusCard
              label="スキャン状態"
              value={
                connectionStatus === "スキャン中" ? "スキャン中" : "待機中"
              }
              color={getStatusColor(
                connectionStatus === "スキャン中" ? "スキャン中" : "未接続"
              )}
              icon="bluetooth-searching"
            />

            {/* 接続・切断ボタン */}
            <View style={{ marginBottom: 20 }}>
              <Button
                mode="contained"
                onPress={handleConnectPress}
                style={styles.button}
                disabled={
                  connectionStatus === "スキャン中" ||
                  connectionStatus === "接続中"
                }
              >
                {isConnected ? "切断" : "接続"}
              </Button>
            </View>

            {connectedDeviceInfo && (
              <DeviceInfo
                device={{
                  id: connectedDeviceInfo.device.id,
                  name: connectedDeviceInfo.device.name || "名称不明",
                  connectionTime: new Date(connectedDeviceInfo.connectionTime),
                  rssi: connectedDeviceInfo.rssi,
                  serviceUUIDs: connectedDeviceInfo.device.serviceUUIDs || [],
                  isConnected,
                }}
              />
            )}

            {/* 接続ダイアログ */}
            <Portal>
              <Dialog
                visible={showConnectionDialog}
                onDismiss={() => setShowConnectionDialog(false)}
              >
                <Dialog.Title>デバイスに接続</Dialog.Title>
                <Dialog.Content>
                  <TextInput
                    label="デバイス名"
                    value={targetDeviceName}
                    onChangeText={setTargetDeviceName}
                    mode="outlined"
                    style={{ marginBottom: 16 }}
                    placeholder="例: MyBLEDevice"
                  />
                  <TextInput
                    label="サービスUUID"
                    value={serviceUUID}
                    onChangeText={setServiceUUID}
                    mode="outlined"
                    placeholder="例: 0000180F-0000-1000-8000-00805F9B34FB"
                  />
                </Dialog.Content>
                <Dialog.Actions>
                  <Button onPress={() => setShowConnectionDialog(false)}>
                    キャンセル
                  </Button>
                  <Button
                    onPress={handleConnect}
                    disabled={!targetDeviceName.trim() || !serviceUUID.trim()}
                  >
                    接続
                  </Button>
                </Dialog.Actions>
              </Dialog>
            </Portal>
          </ScrollView>
        </SafeAreaView>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  button: {
    marginTop: 16,
  },
  discoveredContainer: {
    backgroundColor: "white",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  discoveredTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  discoveredDevice: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  discoveredName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  discoveredId: {
    fontSize: 12,
    color: "#757575",
  },
  discoveredRssi: {
    fontSize: 12,
    color: "#757575",
  },
  moreDevices: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
  infoContainer: {
    backgroundColor: "white",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  helpContainer: {
    backgroundColor: "#fff3cd",
    padding: 15,
    marginBottom: 20,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ffc107",
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#856404",
    marginBottom: 10,
  },
  helpText: {
    fontSize: 14,
    color: "#856404",
    lineHeight: 20,
  },
});

export default App;
