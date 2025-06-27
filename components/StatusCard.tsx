import React from "react";
import { StyleSheet } from "react-native";
import { Avatar, Card, Paragraph, Title } from "react-native-paper";

interface StatusCardProps {
  label: string;
  value: string;
  color: string;
  icon: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ label, value, color, icon }) => {
  return (
    <Card style={styles.container}>
      <Card.Content style={styles.content}>
        <Avatar.Icon size={40} icon={icon} style={{ backgroundColor: color }} />
        <Title style={styles.label}>{label}</Title>
        <Paragraph style={[styles.value, { color }]}>{value}</Paragraph>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 16,
    flex: 1,
  },
  value: {
    fontSize: 16,
    fontWeight: "bold",
  },
});
