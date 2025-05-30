import { API_ENDPOINTS } from "../constants";
import { APIResponse, RoomStatusAPI } from "../types";

export class ApiService {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async makeRequest(
    endpoint: string,
    data: RoomStatusAPI
  ): Promise<APIResponse> {
    try {
      console.log(`API Request to ${this.baseURL}${endpoint}`, data);
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();

      if (response.ok) {
        console.log(`API Success (${endpoint}):`, result);
        return {
          success: true,
          data: result,
        };
      } else {
        console.error(`API Error (${endpoint}):`, response.status, result);
        return {
          success: true,
          data: result,
        };
      }
    } catch (error) {
      console.error(`API Request Error (${endpoint})`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  async sendEnterRoom(data: RoomStatusAPI): Promise<APIResponse> {
    return this.makeRequest(API_ENDPOINTS.ENTER_ROOM, data);
  }

  async sendExitRoom(data: RoomStatusAPI): Promise<APIResponse> {
    return this.makeRequest(API_ENDPOINTS.EXIT_ROOM, data);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseURL}${API_ENDPOINTS.HEALTH_CHECK}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Health check failed:", error);
      return false;
    }
  }
}
