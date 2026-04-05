/**
 * React Query Hooks
 * Custom hooks for data fetching from the API backend
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

/**
 * Health Check
 */
export const useHealthCheck = () => {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.getHealth(),
    refetchInterval: 30000, // Every 30 seconds
    retry: 2,
  });
};

/**
 * Exceptions (At-risk shipments)
 */
export const useExceptions = (skip: number = 0, limit: number = 20) => {
  return useQuery({
    queryKey: ['exceptions', skip, limit],
    queryFn: () => apiClient.getExceptions(skip, limit),
    refetchInterval: 5000, // Live updates every 5 seconds
    staleTime: 2000,
    retry: 1,
  });
};

export const useException = (shipmentId: string) => {
  return useQuery({
    queryKey: ['exception', shipmentId],
    queryFn: () => apiClient.getException(shipmentId),
    enabled: !!shipmentId,
    staleTime: 5000,
    retry: 1,
  });
};

/**
 * Recommendations
 */
export const useRecommendations = (shipmentId: string | null) => {
  return useQuery({
    queryKey: ['recommendations', shipmentId],
    queryFn: () => apiClient.getRecommendations(shipmentId!),
    enabled: !!shipmentId,
    staleTime: 30000,
    retry: 0,
  });
};

/**
 * KPI Summary
 */
export const useKPISummary = () => {
  return useQuery({
    queryKey: ['kpi-summary'],
    queryFn: () => apiClient.getKPISummary(),
    refetchInterval: 5000, // Live updates every 5 seconds
    staleTime: 2000,
    retry: 1,
  });
};

/**
 * Scenario Analysis
 */
export const useScenarioAnalysis = () => {
  return useMutation({
    mutationFn: (params: { shipmentId: string; scenarioText: string }) =>
      apiClient.submitScenario(params.shipmentId, params.scenarioText),
  });
};

/**
 * Shipments List
 */
export const useShipments = (skip: number = 0, limit: number = 20) => {
  return useQuery({
    queryKey: ['shipments', skip, limit],
    queryFn: () => apiClient.listShipments(skip, limit),
    staleTime: 30000,
    retry: 1,
  });
};

export const useTasks = (status?: string) => {
  return useQuery({
    queryKey: ['tasks', status || 'all'],
    queryFn: () => apiClient.getTasks(status),
    refetchInterval: 5000,
    staleTime: 2000,
    retry: 1,
  });
};

/**
 * Tasks (CRUD)
 */
export const useCreateTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskData: Record<string, unknown>) => apiClient.createTask(taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

export const useUpdateTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { taskId: string; taskData: Record<string, unknown> }) =>
      apiClient.updateTask(params.taskId, params.taskData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};
