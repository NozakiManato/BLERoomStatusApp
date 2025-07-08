import { BleManager } from "react-native-ble-plx";

// アプリケーション全体で共有する唯一のBleManagerインスタンス
const bleManager = new BleManager();

export default bleManager;
