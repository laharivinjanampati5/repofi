/**
 * API Client
 * Handles all HTTP communication with the backend API server
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface ApiException {
  id: string;
  shipmentId: string;
  containerId: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priorityScore: number;
  issueType: string;
  region: string;
  terminal: string;
  customerTier: string;
  timeToSLA: string;
  recommendedAction: string;
  owner: string;
  status: string;
  cost: number;
  createdAt: string;
}

export interface ApiRecommendation {
  id: string;
  label: string;
  confidence: number;
  costImpact: number;
  timeImpact: string;
  slaImpact: string;
  explanation: string;
  dataSources: string[];
  requiredOwner: string;
  dueBy: string;
}

export interface ApiKPISummary {
  criticalExceptions: number;
  atRiskShipments: Array<{ region: string; count: number }>;
  demurrageRisk: number;
  systemHealth: Array<{ name: string; status: string; latency: number }>;
  lastUpdated: string;
}

export interface ApiTask {
  id: string;
  title: string;
  assignee: string;
  dueTime: string;
  status: 'pending' | 'in-progress' | 'completed' | 'escalated';
  relatedShipment: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface HealthCheckResponse {
  status: string;
  datasets_loaded: boolean;
  timestamp: string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const detail = error?.detail;
        let detailMessage = `API error: ${response.status}`;

        if (typeof detail === 'string') {
          detailMessage = detail;
        } else if (detail && typeof detail === 'object') {
          detailMessage = JSON.stringify(detail);
        }

        throw new Error(`${response.status}: ${detailMessage}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Health & Status
  async getHealth(): Promise<HealthCheckResponse> {
    return this.request('/api/health');
  }

  // Exceptions
  async getExceptions(skip: number = 0, limit: number = 20): Promise<ApiException[]> {
    return this.request(`/api/exceptions?skip=${skip}&limit=${limit}`);
  }

  async getException(shipmentId: string): Promise<ApiException> {
    return this.request(`/api/exceptions/${shipmentId}`);
  }

  // Recommendations
  async getRecommendations(shipmentId: string): Promise<ApiRecommendation[]> {
    return this.request(`/api/recommendations/${shipmentId}`);
  }

  // KPI
  async getKPISummary(): Promise<ApiKPISummary> {
    return this.request('/api/kpi-summary');
  }

  // Scenarios
  async submitScenario(
    shipmentId: string,
    scenarioText: string
  ): Promise<{
    slaDeltaPct: number;
    demurrageDeltaUsd: number;
    recommendation: ApiRecommendation[];
  }> {
    return this.request('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify({
        shipmentId,
        scenarioText,
      }),
    });
  }

  // Shipments
  async listShipments(skip: number = 0, limit: number = 20): Promise<{
    shipments: string[];
    total: number;
  }> {
    return this.request(`/api/shipments?skip=${skip}&limit=${limit}`);
  }

  // Tasks
  async getTasks(status?: string): Promise<ApiTask[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request(`/api/tasks${query}`);
  }

  async createTask(taskData: Record<string, unknown>): Promise<ApiTask> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData),
    });
  }

  async updateTask(
    taskId: string,
    taskData: Record<string, unknown>
  ): Promise<ApiTask> {
    return this.request(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData),
    });
  }
}

export const apiClient = new ApiClient();
