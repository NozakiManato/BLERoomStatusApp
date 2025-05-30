import React from "react";
import { StyleSheet, View, Text } from "react-native";

interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  backgroundColor?: string;
  icon?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  label,
  value,
  color,
  backgroundColor = "white",
  icon,
}) => {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      <View style={styles.labelContainer}>
        {icon && <Text style={styles.icon}>{icon}</Text>}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={[styles.value, { color }]}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  value: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
