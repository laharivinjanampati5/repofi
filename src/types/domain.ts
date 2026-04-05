export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Status = 'open' | 'in-progress' | 'resolved' | 'escalated';

export interface Exception {
  id: string;
  shipmentId: string;
  containerId: string;
  priority: Priority;
  priorityScore: number;
  issueType: string;
  region: string;
  terminal: string;
  customerTier: string;
  timeToSLA: string;
  recommendedAction: string;
  owner: string;
  status: Status;
  cost: number;
  createdAt: string;
}

export interface KPIData {
  criticalExceptions: number;
  atRiskShipments: { region: string; count: number }[];
  slaBreachTrend: { day: string; breaches: number; resolved: number }[];
  demurrageRisk: number;
  systemHealth: { name: string; status: 'healthy' | 'degraded' | 'down'; latency: number }[];
}

export interface Recommendation {
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

export interface Task {
  id: string;
  title: string;
  assignee: string;
  dueTime: string;
  status: 'pending' | 'in-progress' | 'completed' | 'escalated';
  relatedShipment: string;
  priority: Priority;
}

export const ROLES = [
  { id: 'ctm', label: 'Control Tower Manager', access: 'full' },
  { id: 'tp', label: 'Terminal Planner', access: 'subset' },
  { id: 'ops', label: 'Operations Analyst', access: 'read-only' },
] as const;
