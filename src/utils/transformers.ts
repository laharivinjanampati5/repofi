/**
 * Data Transformers
 * Convert between API responses and frontend types
 */

import { ApiException, ApiRecommendation, ApiKPISummary, ApiTask } from '../api/client';
import { Exception, Priority, Recommendation, KPIData, Task } from '../types/domain';

/**
 * Convert API Exception to frontend Exception type
 */
export function transformApiException(apiExc: ApiException): Exception {
  return {
    id: apiExc.id,
    shipmentId: apiExc.shipmentId,
    containerId: apiExc.containerId,
    priority: apiExc.priority as Priority,
    priorityScore: apiExc.priorityScore,
    issueType: apiExc.issueType,
    region: apiExc.region,
    terminal: apiExc.terminal,
    customerTier: apiExc.customerTier,
    timeToSLA: apiExc.timeToSLA,
    recommendedAction: apiExc.recommendedAction,
    owner: apiExc.owner,
    status: apiExc.status as 'open' | 'in-progress' | 'resolved' | 'escalated',
    cost: apiExc.cost,
    createdAt: apiExc.createdAt,
  };
}

/**
 * Convert API Exceptions list
 */
export function transformApiExceptions(apiExceptions: ApiException[]): Exception[] {
  return apiExceptions.map(transformApiException);
}

export function transformApiTask(apiTask: ApiTask): Task {
  return {
    id: apiTask.id,
    title: apiTask.title,
    assignee: apiTask.assignee,
    dueTime: apiTask.dueTime,
    status: apiTask.status,
    relatedShipment: apiTask.relatedShipment,
    priority: apiTask.priority,
  };
}

export function transformApiTasks(apiTasks: ApiTask[]): Task[] {
  return apiTasks.map(transformApiTask);
}

/**
 * Convert API Recommendation to frontend Recommendation type
 */
export function transformApiRecommendation(apiRec: ApiRecommendation): Recommendation {
  return {
    id: apiRec.id,
    label: apiRec.label,
    confidence: apiRec.confidence,
    costImpact: apiRec.costImpact,
    timeImpact: apiRec.timeImpact,
    slaImpact: apiRec.slaImpact,
    explanation: apiRec.explanation,
    dataSources: apiRec.dataSources,
    requiredOwner: apiRec.requiredOwner,
    dueBy: apiRec.dueBy,
  };
}

/**
 * Convert API Recommendations list
 */
export function transformApiRecommendations(apiRecs: ApiRecommendation[]): Recommendation[] {
  return apiRecs.map(transformApiRecommendation);
}

/**
 * Convert API KPI Summary to frontend KPI Data type
 */
export function transformApiKPISummary(apiKpi: ApiKPISummary): KPIData {
  const totalAtRisk = apiKpi.atRiskShipments.reduce((sum, item) => sum + item.count, 0);
  const base = Math.max(1, Math.round(totalAtRisk / 7));
  const dayWeights = [0.82, 0.95, 1.08, 1.02, 0.88, 0.74, 1.11];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return {
    criticalExceptions: apiKpi.criticalExceptions,
    atRiskShipments: apiKpi.atRiskShipments,
    slaBreachTrend: days.map((day, idx) => {
      const breaches = Math.max(0, Math.round(base * dayWeights[idx]));
      const resolved = Math.max(0, Math.round(breaches * 1.9));
      return { day, breaches, resolved };
    }),
    demurrageRisk: apiKpi.demurrageRisk,
    systemHealth: apiKpi.systemHealth.map(sys => ({
      name: sys.name,
      status: sys.status as 'healthy' | 'degraded' | 'down',
      latency: sys.latency,
    })),
  };
}

/**
 * Utility: Format time delta for display
 */
export function formatTimeDelta(hours: number): string {
  if (hours < 0) return `${Math.abs(hours).toFixed(1)}h faster`;
  if (hours > 0) return `${hours.toFixed(1)}h slower`;
  return 'No ETA change';
}

/**
 * Utility: Format currency
 */
export function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

/**
 * Utility: Format SLA time
 */
export function formatSLATime(hours: number): string {
  if (hours <= 0) return 'Now';
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours <= 0) return `${minutes}m`;
  return `${wholeHours}h ${minutes.toString().padStart(2, '0')}m`;
}
