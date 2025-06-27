import React, { useState, useEffect } from "react";
import { DEFAULT_CONFIG } from "./constants";
import { useBLE, usePermissions } from "./hooks";
import { RoomStatus } from "./types";
import { DeviceInfo, PermissionScreen, StatusCard } from "./components";
import { SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Provider as PaperProvider, Text, Title } from "react-native-paper";
import { SettingsScreen } from "./components/SettingsScreen";
import AsyncStorage from "@react-native-async-storage/async-storage";

const App: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState(() => DEFAULT_CONFIG);
  const [isFirstLaunch, setIsFirstLaunch] = useState(true);
  const {
    permissionsGranted,
    isLoading,
    requestPermissions,
    checkPermissions,
    bleManager,
  } = usePermissions();
  const { isConnected, connectedDevice, connectionStatus, scanStatus, startScanning, disconnect } = useBLE(
    { config, permissionsGranted, bleManager }
  );

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
      />
    );
  }

  if (isFirstLaunch || showSettings) {
    return <SettingsScreen onSave={handleSaveSettings} />;
  }

  return (
    <PaperProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <Appbar.Header>
          <Appbar.Content title="BLE Room Status" />
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
            value={scanStatus}
            color={getStatusColor(scanStatus)}
            icon="bluetooth-searching"
          />

          {/* 接続・切断ボタン */}
          <View style={{ marginBottom: 20 }}>
            {isConnected ? (
              <Button mode="contained" onPress={disconnect} style={styles.button}>
                切断
              </Button>
            ) : (
              <Button mode="contained" onPress={startScanning} style={styles.button}>
                接続
              </Button>
            )}
          </View>

          {connectedDevice && <DeviceInfo device={connectedDevice} />}
        </ScrollView>
      </SafeAreaView>
    </PaperProvider>
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
