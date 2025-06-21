import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ConnectedDevice } from "../types";

interface DeviceInfoProps {
  device: ConnectedDevice;
}

export const DeviceInfo: React.FC<DeviceInfoProps> = ({ device }) => {
  const formatConnectionTime = (date: Date): string => {
    return date.toLocaleString("ja-JP");
  };

  const getSignalStrengthIcon = (rssi?: number): string => {
    if (rssi === undefined || rssi === null) return "❓";
    if (rssi > -50) return "📶"; // 非常に強い
    if (rssi > -70) return "📡"; // 普通
    if (rssi > -80) return "▲"; // 弱い
    return "❌"; // 非常に弱い
  };

  const getSignalStrengthText = (rssi?: number): string => {
    if (rssi === undefined || rssi === null) return "不明";
    if (rssi > -50) return "強い";
    if (rssi > -70) return "普通";
    if (rssi > -80) return "弱い";
    return "非常に弱い";
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>📱 接続デバイス情報</Text>
      <View style={styles.deviceContainer}>
        <Text style={styles.deviceName}>
          🔗 {device.name || "Unknown Device"}
        </Text>
        <Text style={styles.deviceId}>🆔 ID: {device.id}</Text>
        <Text style={styles.connectionTime}>
          ⏰ 接続時刻: {formatConnectionTime(device.connectionTime)}
        </Text>
        {device.rssi !== undefined && (
          <Text style={styles.rssi}>
            {getSignalStrengthIcon(device.rssi)} 信号強度: {device.rssi} dBm (
            {getSignalStrengthText(device.rssi)})
          </Text>
        )}
        <View style={styles.statusIndicator}>
          <Text style={styles.statusText}>✅ 接続中</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  deviceContainer: {
    paddingLeft: 10,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
    marginBottom: 6,
  },
  deviceId: {
    fontSize: 12,
    color: "#757575",
    marginBottom: 4,
  },
  connectionTime: {
    fontSize: 12,
    color: "#757575",
    marginBottom: 4,
  },
  rssi: {
    fontSize: 12,
    color: "#757575",
    marginBottom: 8,
  },
  statusIndicator: {
    backgroundColor: "#E8F5E8",
    padding: 8,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 12,
    color: "#4CAF50",
    fontWeight: "600",
  },
});
