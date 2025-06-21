import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Button, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsScreenProps {
  onSave: (userId: string) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onSave }) => {
  const [userId, setUserId] = useState("");

  useEffect(() => {
    (async () => {
      const storedUserId = await AsyncStorage.getItem("userId");
      if (storedUserId) setUserId(storedUserId);
    })();
  }, []);

  const handleSave = async () => {
    await AsyncStorage.setItem("userId", userId);
    onSave(userId);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ユーザー情報登録</Text>
      <Text style={styles.label}>ユーザーID</Text>
      <TextInput
        style={styles.input}
        value={userId}
        onChangeText={setUserId}
        placeholder="ユーザーIDを入力"
        autoCapitalize="none"
      />
      <Button title="保存" onPress={handleSave} disabled={!userId} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 30,
    color: "#333",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    alignSelf: "flex-start",
  },
  input: {
    width: 280,
    height: 44,
    borderColor: "#ccc",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginBottom: 20,
    backgroundColor: "#fff",
    fontSize: 16,
  },
});
