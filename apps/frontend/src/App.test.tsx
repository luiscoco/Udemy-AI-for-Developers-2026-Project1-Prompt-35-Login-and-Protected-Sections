import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Asset, DashboardSummary, Technician, User, WorkOrder } from "@equipment-hub/contract";
import App from "./App";
import * as apiClient from "./api/client";
import { TOKEN_STORAGE_KEY } from "./auth/session";

vi.mock("./api/client", async () => {
  const actual = await vi.importActual<typeof import("./api/client")>("./api/client");
  return {
    ...actual,
    listWorkOrders: vi.fn(),
    listAssets: vi.fn(),
    listTechnicians: vi.fn(),
    getDashboardSummary: vi.fn(),
    assignTechnician: vi.fn(),
    transitionWorkOrder: vi.fn(),
    createWorkOrder: vi.fn(),
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  };
});

const currentUser: User = {
  id: "user-1",
  email: "sam@equipment-hub.test",
  name: "Sam Supervisor",
  role: "supervisor",
  technicianId: null,
};

const assets: Asset[] = [{ id: "asset-1", tag: "PUMP-01", name: "Feed Pump", location: "Building A" }];

const technicians: Technician[] = [{ id: "tech-1", name: "Jamie Rivera", specialty: "Mechanical" }];

const baseWorkOrder: WorkOrder = {
  id: "wo-1",
  reference: "WO-2026-0001",
  assetId: "asset-1",
  title: "Pump leaking",
  description: "Visible leak near seal",
  priority: "high",
  state: "triaged",
  technicianId: null,
  reportedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const summary: DashboardSummary = {
  totalOpen: 1,
  criticalOpen: 0,
  unassigned: 1,
  byState: { triaged: 1 },
};

function mockBoardData() {
  vi.mocked(apiClient.listWorkOrders).mockResolvedValue([baseWorkOrder]);
  vi.mocked(apiClient.listAssets).mockResolvedValue(assets);
  vi.mocked(apiClient.listTechnicians).mockResolvedValue(technicians);
  vi.mocked(apiClient.getDashboardSummary).mockResolvedValue(summary);
}

function signInAsStoredUser() {
  localStorage.setItem(TOKEN_STORAGE_KEY, "stored-token");
  vi.mocked(apiClient.getCurrentUser).mockResolvedValue(currentUser);
}

describe("App authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the login form and not the board when unauthenticated", async () => {
    mockBoardData();

    render(<App />);

    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "WO-2026-0001" })).not.toBeInTheDocument();
    expect(apiClient.getCurrentUser).not.toHaveBeenCalled();
    expect(apiClient.listWorkOrders).not.toHaveBeenCalled();
  });

  it("shows an inline error when login fails", async () => {
    const user = userEvent.setup();
    vi.mocked(apiClient.login).mockRejectedValue(new apiClient.ClientApiError(401, "Invalid email or password"));

    render(<App />);

    await user.type(screen.getByLabelText("Email"), "sam@equipment-hub.test");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByRole("form", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in through the form and then shows the board with the user's name and role", async () => {
    const user = userEvent.setup();
    mockBoardData();
    vi.mocked(apiClient.login).mockResolvedValue({ token: "jwt-123", user: currentUser });

    render(<App />);

    await user.type(screen.getByLabelText("Email"), "sam@equipment-hub.test");
    await user.type(screen.getByLabelText("Password"), "Super!2345");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("button", { name: "WO-2026-0001" })).toBeInTheDocument();
    expect(apiClient.login).toHaveBeenCalledWith({ email: "sam@equipment-hub.test", password: "Super!2345" });
    const header = screen.getByLabelText("Current user");
    expect(header).toHaveTextContent("Sam Supervisor");
    expect(header).toHaveTextContent("supervisor");
  });

  it("shows the board for a stored session and returns to the login form on logout", async () => {
    const user = userEvent.setup();
    mockBoardData();
    signInAsStoredUser();

    render(<App />);

    expect(await screen.findByRole("button", { name: "WO-2026-0001" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current user")).toHaveTextContent("Sam Supervisor");

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "WO-2026-0001" })).not.toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("App integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInAsStoredUser();
  });

  it("selects a triaged work order, assigns a technician, schedules it, and refreshes the dashboard summary", async () => {
    const user = userEvent.setup();

    const listWorkOrdersMock = vi.mocked(apiClient.listWorkOrders);
    const listAssetsMock = vi.mocked(apiClient.listAssets);
    const listTechniciansMock = vi.mocked(apiClient.listTechnicians);
    const getDashboardSummaryMock = vi.mocked(apiClient.getDashboardSummary);
    const assignTechnicianMock = vi.mocked(apiClient.assignTechnician);
    const transitionWorkOrderMock = vi.mocked(apiClient.transitionWorkOrder);

    listWorkOrdersMock.mockResolvedValue([baseWorkOrder]);
    listAssetsMock.mockResolvedValue(assets);
    listTechniciansMock.mockResolvedValue(technicians);
    getDashboardSummaryMock.mockResolvedValue(summary);

    const assignedWorkOrder: WorkOrder = { ...baseWorkOrder, technicianId: "tech-1" };
    assignTechnicianMock.mockResolvedValue(assignedWorkOrder);

    const scheduledWorkOrder: WorkOrder = { ...assignedWorkOrder, state: "scheduled" };
    transitionWorkOrderMock.mockResolvedValue(scheduledWorkOrder);

    render(<App />);

    // 1. Loads the mocked dashboard and work-order board.
    expect(await screen.findByRole("button", { name: "WO-2026-0001" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Dashboard summary")).toBeInTheDocument();
    expect(getDashboardSummaryMock).toHaveBeenCalledTimes(1);

    // 2. Selects the triaged work order.
    await user.click(screen.getByRole("button", { name: "WO-2026-0001" }));
    expect(screen.getByRole("heading", { name: "WO-2026-0001" })).toBeInTheDocument();

    // 3. Assigns a technician.
    await user.selectOptions(screen.getByLabelText("Technician"), "tech-1");
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(assignTechnicianMock).toHaveBeenCalledWith("wo-1", "tech-1");
    await screen.findAllByText("Jamie Rivera");
    const technicianTerm = screen.getByText("Technician", { selector: "dt" });
    expect(technicianTerm.nextElementSibling).toHaveTextContent("Jamie Rivera");
    expect(getDashboardSummaryMock).toHaveBeenCalledTimes(2);

    // 4. Schedules the work order.
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    expect(transitionWorkOrderMock).toHaveBeenCalledWith("wo-1", "schedule");

    // 5. Verifies the board and panel show scheduled.
    const boardRow = (await screen.findByRole("button", { name: "WO-2026-0001" })).closest("tr");
    expect(boardRow).not.toBeNull();
    expect(within(boardRow as HTMLElement).getByText("Scheduled")).toBeInTheDocument();

    const panel = screen.getByRole("heading", { name: "WO-2026-0001" }).closest("div") as HTMLElement;
    expect(within(panel).getByText("Scheduled")).toBeInTheDocument();

    // 6. Verifies the dashboard summary refresh function was called after each mutation.
    expect(getDashboardSummaryMock).toHaveBeenCalledTimes(3);
  });
});
