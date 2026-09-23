import type {
  Asset,
  AssignmentCommand,
  DashboardSummary,
  LoginRequest,
  LoginResponse,
  NewWorkOrder,
  Priority,
  Technician,
  TransitionCommand,
  User,
  WorkOrder,
  WorkOrderAction,
  WorkOrderState,
} from "@equipment-hub/contract";
import { getToken, notifyUnauthorized } from "../auth/session";

export class ClientApiError extends Error {
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions extends RequestInit {
  /**
   * When true, a 401 is returned to the caller as a normal error instead of
   * ending the session (used by login, where 401 means bad credentials).
   */
  skipUnauthorizedHandling?: boolean;
}

async function requestJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const { skipUnauthorizedHandling, ...init } = options ?? {};
  const token = getToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && !skipUnauthorizedHandling) {
    notifyUnauthorized();
  }

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    let details: Record<string, unknown> | undefined;

    try {
      const body = (await response.json()) as { message?: string; details?: Record<string, unknown> };
      if (body?.message) {
        message = body.message;
      }
      details = body?.details;
    } catch {
      // Response body was not valid JSON; fall back to the status text.
    }

    throw new ClientApiError(response.status, message, details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return requestJson<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
    skipUnauthorizedHandling: true,
  });
}

export function getCurrentUser(): Promise<User> {
  return requestJson<User>("/api/auth/me");
}

export function listAssets(): Promise<Asset[]> {
  return requestJson<Asset[]>("/api/assets");
}

export function listTechnicians(): Promise<Technician[]> {
  return requestJson<Technician[]>("/api/technicians");
}

export interface WorkOrderFilters {
  state?: WorkOrderState;
  priority?: Priority;
}

export function listWorkOrders(filters?: WorkOrderFilters): Promise<WorkOrder[]> {
  const params = new URLSearchParams();
  if (filters?.state) {
    params.set("state", filters.state);
  }
  if (filters?.priority) {
    params.set("priority", filters.priority);
  }
  const query = params.toString();
  return requestJson<WorkOrder[]>(`/api/work-orders${query ? `?${query}` : ""}`);
}

export function getWorkOrder(id: string): Promise<WorkOrder> {
  return requestJson<WorkOrder>(`/api/work-orders/${encodeURIComponent(id)}`);
}

export function createWorkOrder(input: NewWorkOrder): Promise<WorkOrder> {
  return requestJson<WorkOrder>("/api/work-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function assignTechnician(id: string, technicianId: string): Promise<WorkOrder> {
  const command: AssignmentCommand = { technicianId };
  return requestJson<WorkOrder>(`/api/work-orders/${encodeURIComponent(id)}/assignment`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export function transitionWorkOrder(id: string, action: WorkOrderAction): Promise<WorkOrder> {
  const command: TransitionCommand = { action };
  return requestJson<WorkOrder>(`/api/work-orders/${encodeURIComponent(id)}/transitions`, {
    method: "POST",
    body: JSON.stringify(command),
  });
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>("/api/dashboard/summary");
}
