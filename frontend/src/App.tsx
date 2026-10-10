import { useState, useEffect, lazy, Suspense } from "react";
import type { ReactNode } from "react";
import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { auth } from "./firebase.ts";

const RenterManagement = lazy(() => import("./components/RenterManagement"));
const RepairManagement = lazy(() => import("./components/RepairManagement"));
const RepairPortal = lazy(() => import("./components/RepairPortal"));
const JoinPage = lazy(() => import("./components/JoinPage"));
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "https://staynexa-1.onrender.com/api/v1";
const CHART_COLORS = [
  "#4f46e5",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];
type DashboardData = {
  totalRooms: number;
  activeRooms: number;

  availableRooms: number;
  occupiedRooms: number;

  activeRenters: number;

  totalFees: number;
  paidFees: number;
  outstandingFees: number;
  pendingFees: number;
  partiallyPaidFees: number;
  overdueFees: number;

  totalPayments: number;
  paidPayments: number;
  pendingPayments: number;

  totalRepairRequests: number;
  submittedRepairs: number;
  inProgressRepairs: number;
  resolvedRepairs: number;
  cancelledRepairs: number;

  hostelCount: number;
};

type Hostel = {
  id: string;
  name: string;
  type?: string | null;
  city?: string | null;
  state?: string | null;
  address?: string | null;
};

type Room = {
  id: string;
  hostelId: string;
  roomNumber: string;
  floor?: string | number | null;
  status?: string | null;
};

type RenterSummary = {
  id: string;
  roomId?: string | null;
  status?: string | null;
};

type Page =
  | "dashboard"
  | "hostels"
  | "rooms"
  | "renters"
  | "fees"
  | "payments"
  | "repairs"
  | "notifications";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [token, setToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<any>(null);

  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null);

  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [selectedHostelId, setSelectedHostelId] =
    useState<string>("");

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomRenters, setRoomRenters] =
    useState<RenterSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomSaving, setRoomSaving] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState("");

  const [page, setPage] =
    useState<Page>("dashboard");

  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If the user accessed the join page via QR code (using query params avoids GH pages 404)
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get("page") === "join" || window.location.pathname.endsWith("/join")) {
    return (
      <Suspense fallback={<div className="loading-screen"><div className="loader"></div></div>}>
        <JoinPage />
      </Suspense>
    );
  }

  // Restore authenticated session when page is refreshed or reopened
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setToken(null);
        setAuthUser(null);
        setInitializing(false);
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();
        const headers = { Authorization: `Bearer ${idToken}` };

        const meRes = await fetch(`${API_URL}/auth/me`, { headers });
        if (meRes.ok) {
          const meData = await meRes.json();
          const role = meData.user?.role;
          setAuthUser(meData.user);

          if (role === "REPAIR_PERSON") {
            setToken(idToken);
            setInitializing(false);
            return;
          }

          if (role === "ADMIN" || role === "SUPER_ADMIN") {
            const [hostelData, dashRes] = await Promise.all([
              fetchHostels(idToken),
              fetch(`${API_URL}/dashboard`, { headers }),
            ]);
            setToken(idToken);
            setHostels(hostelData);
            if (hostelData.length > 0) setSelectedHostelId(hostelData[0].id);
            if (dashRes.ok) {
              const dData = await dashRes.json();
              if (dData.dashboard) setDashboard(dData.dashboard);
            }
          }
        }
      } catch (err) {
        console.warn("Failed to restore web auth session:", err);
      } finally {
        setInitializing(false);
      }
    });

    return () => unsubscribe();
  }, []);

  async function login() {
    try {
      setLoading(true);
      setError("");

      const identifier = email.trim();
      let credentialEmail = identifier;
      let usedCustomToken: string | null = null;

      // If user typed a mobile number / phone (no @)
      if (!identifier.includes("@")) {
        // Try lookup by phone
        const lookupRes = await fetch(`${API_URL}/auth/login-lookup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier }),
        });

        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          if (lookupData.email) {
            credentialEmail = lookupData.email;
          }
        } else {
          // Fallback to repair-login custom token
          const repRes = await fetch(`${API_URL}/auth/repair-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, password }),
          });
          if (repRes.ok) {
            const repData = await repRes.json();
            if (repData.customToken) {
              usedCustomToken = repData.customToken;
            }
          } else {
            throw new Error("No account found with this email or mobile number.");
          }
        }
      }

      let idToken: string;

      if (usedCustomToken) {
        const credential = await signInWithCustomToken(auth, usedCustomToken);
        idToken = await credential.user.getIdToken();
      } else {
        const credential = await signInWithEmailAndPassword(
          auth,
          credentialEmail,
          password,
        );
        idToken = await credential.user.getIdToken();
      }

      const headers = { Authorization: `Bearer ${idToken}` };
      const meRes = await fetch(`${API_URL}/auth/me`, { headers });
      const meData = await meRes.json();
      if (!meRes.ok) {
        throw new Error(meData.message || "Unable to load user profile");
      }

      const role = meData.user?.role;
      setAuthUser(meData.user);

      if (role === "REPAIR_PERSON") {
        setToken(idToken);
        return;
      }

      if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
        await signOut(auth);
        throw new Error("This portal is for Admins and Repair Personnel only. Renters should use the mobile app.");
      }

      // Fast parallel fetch for Admin
      const [hostelData, dashRes] = await Promise.all([
        fetchHostels(idToken),
        fetch(`${API_URL}/dashboard`, { headers }),
      ]);

      setToken(idToken);
      setHostels(hostelData);
      if (hostelData.length > 0) {
        setSelectedHostelId(hostelData[0].id);
      }

      if (dashRes.ok) {
        const dData = await dashRes.json();
        if (dData.dashboard) {
          setDashboard(dData.dashboard);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Login failed",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchHostels(
    idToken: string,
  ): Promise<Hostel[]> {
    const response = await fetch(
      `${API_URL}/hostels`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Unable to load hostels",
      );
    }

    return data.hostels ?? [];
  }

  async function fetchRooms(
    idToken: string,
    hostelId: string,
  ) {
    const response = await fetch(
      `${API_URL}/hostels/${hostelId}/rooms`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Unable to load rooms",
      );
    }

    return data.rooms ?? [];
  }

  async function fetchRoomRenters(
    idToken: string,
    hostelId: string,
  ) {
    const response = await fetch(
      `${API_URL}/hostels/${hostelId}/renters`,
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Unable to load renters",
      );
    }

    return data.renters ?? [];
  }

  async function loadRooms(hostelId = selectedHostelId) {
    if (!token || !hostelId) {
      setRooms([]);
      setRoomRenters([]);
      return;
    }

    try {
      setRoomsLoading(true);
      setRoomError("");

      const [roomData, renterData] =
        await Promise.all([
          fetchRooms(token, hostelId),
          fetchRoomRenters(token, hostelId),
        ]);

      setRooms(roomData);
      setRoomRenters(renterData);
    } catch (err) {
      setRoomError(
        err instanceof Error
          ? err.message
          : "Unable to load rooms",
      );
    } finally {
      setRoomsLoading(false);
    }
  }

  async function addRoom() {
    if (!token || !selectedHostelId) {
      setRoomError("Select a hostel first.");
      return;
    }

    const roomNumber = newRoomNumber.trim();
    const floor = newRoomFloor.trim();

    if (!roomNumber) {
      setRoomError("Room number is required.");
      return;
    }

    try {
      setRoomSaving(true);
      setRoomError("");

      const response = await fetch(
        `${API_URL}/hostels/${selectedHostelId}/rooms`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            roomNumber,
            ...(floor ? { floor } : {}),
            status: "ACTIVE",
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to add room",
        );
      }

      setNewRoomNumber("");
      setNewRoomFloor("");
      setShowAddRoom(false);

      await loadRooms(selectedHostelId);
    } catch (err) {
      setRoomError(
        err instanceof Error
          ? err.message
          : "Unable to add room",
      );
    } finally {
      setRoomSaving(false);
    }
  }

  async function deleteRoom(room: Room) {
    if (!token || !selectedHostelId) {
      return;
    }

    const hasActiveRenter = roomRenters.some(
      (renter) =>
        renter.roomId === room.id &&
        String(renter.status ?? "").toUpperCase() ===
          "ACTIVE",
    );

    if (hasActiveRenter) {
      setRoomError(
        `Room ${room.roomNumber} cannot be deleted because it has an active renter.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete Room ${room.roomNumber}? This action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setRoomSaving(true);
      setRoomError("");

      const response = await fetch(
        `${API_URL}/hostels/${selectedHostelId}/rooms/${room.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to delete room",
        );
      }

      await loadRooms(selectedHostelId);
    } catch (err) {
      setRoomError(
        err instanceof Error
          ? err.message
          : "Unable to delete room",
      );
    } finally {
      setRoomSaving(false);
    }
  }

  async function logout() {
    await signOut(auth);

    setToken(null);
    setAuthUser(null);
    setDashboard(null);
    setHostels([]);
    setSelectedHostelId("");
    setPage("dashboard");

    setEmail("");
    setPassword("");
    setError("");
  }

  function renderPage() {
    if (page === "dashboard") {
  const totalRooms =
    dashboard?.totalRooms ?? 0;

  const occupiedRooms =
    dashboard?.occupiedRooms ?? 0;

  const availableRooms =
    dashboard?.availableRooms ?? 0;

  const roomOccupancyRate =
    totalRooms > 0
      ? Math.round(
          (occupiedRooms / totalRooms) * 100,
        )
      : 0;

  const roomData = [
    {
      name: "Available",
      value: availableRooms,
    },
    {
      name: "Occupied",
      value: occupiedRooms,
    },
  ];

  const feeData = [
    {
      name: "Paid",
      value: dashboard?.paidFees ?? 0,
    },
    {
      name: "Pending",
      value: dashboard?.pendingFees ?? 0,
    },
    {
      name: "Partially Paid",
      value:
        dashboard?.partiallyPaidFees ?? 0,
    },
    {
      name: "Overdue",
      value: dashboard?.overdueFees ?? 0,
    },
  ];

  const paymentData = [
    {
      name: "Paid",
      value: dashboard?.paidPayments ?? 0,
    },
    {
      name: "Pending",
      value: dashboard?.pendingPayments ?? 0,
    },
  ];

  const repairData = [
    {
      name: "Submitted",
      value:
        dashboard?.submittedRepairs ?? 0,
    },
    {
      name: "In Progress",
      value:
        dashboard?.inProgressRepairs ?? 0,
    },
    {
      name: "Resolved",
      value:
        dashboard?.resolvedRepairs ?? 0,
    },
    {
      name: "Cancelled",
      value:
        dashboard?.cancelledRepairs ?? 0,
    },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>

          <p>
            Overview of your HostelDesk
            operations.
          </p>
        </div>
      </div>

      {/* ================================
          KPI CARDS
          ================================ */}

      <section className="cards">
        <DashboardCard
          title="Total Rooms"
          value={
            dashboard?.totalRooms ?? 0
          }
        />

        <DashboardCard
          title="Available Rooms"
          value={
            dashboard?.availableRooms ?? 0
          }
        />

        <DashboardCard
          title="Occupied Rooms"
          value={
            dashboard?.occupiedRooms ?? 0
          }
        />

        <DashboardCard
          title="Active Renters"
          value={
            dashboard?.activeRenters ?? 0
          }
        />

        <DashboardCard
          title="Outstanding Fees"
          value={
            dashboard?.outstandingFees ?? 0
          }
        />

        <DashboardCard
          title="Total Payments"
          value={
            dashboard?.totalPayments ?? 0
          }
        />

        <DashboardCard
          title="Paid Payments"
          value={
            dashboard?.paidPayments ?? 0
          }
        />

        <DashboardCard
          title="Pending Payments"
          value={
            dashboard?.pendingPayments ?? 0
          }
        />

        <DashboardCard
          title="Repair Requests"
          value={
            dashboard?.totalRepairRequests ??
            0
          }
        />
      </section>

      {/* ================================
          ANALYTICS
          ================================ */}

      <section className="dashboard-analytics">

        {/* ROOM STATUS */}

        <DashboardChartCard
          title="Room Status"
          description="Current room availability"
        >
          <div className="chart-container">
            <ResponsiveContainer
              width="100%"
              height={260}
            >
              <PieChart>
                <Pie
                  data={roomData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={92}
                  paddingAngle={3}
                  stroke="none"
                >
                  {roomData.map(
                    (_, index) => (
                      <Cell
                        key={`room-${index}`}
                        fill={
                          CHART_COLORS[
                            index %
                              CHART_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip />

                <Legend
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>

        {/* FEE STATUS */}

        <DashboardChartCard
          title="Fee Status"
          description="Current fee collection status"
        >
          <div className="chart-container">
            <ResponsiveContainer
              width="100%"
              height={260}
            >
              <PieChart>
                <Pie
                  data={feeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={92}
                  paddingAngle={3}
                  stroke="none"
                >
                  {feeData.map(
                    (_, index) => (
                      <Cell
                        key={`fee-${index}`}
                        fill={
                          CHART_COLORS[
                            index %
                              CHART_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip />

                <Legend
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>

        {/* PAYMENT STATUS */}

        <DashboardChartCard
          title="Payment Status"
          description="Paid and pending payments"
        >
          <div className="chart-container">
            <ResponsiveContainer
              width="100%"
              height={260}
            >
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={92}
                  paddingAngle={3}
                  stroke="none"
                >
                  {paymentData.map(
                    (_, index) => (
                      <Cell
                        key={`payment-${index}`}
                        fill={
                          CHART_COLORS[
                            index %
                              CHART_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip />

                <Legend
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>

        {/* REPAIRS */}

        <DashboardChartCard
          title="Repair Requests"
          description="Current repair request status"
        >
          <div className="chart-container">
            <ResponsiveContainer
              width="100%"
              height={260}
            >
              <PieChart>
                <Pie
                  data={repairData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={92}
                  paddingAngle={3}
                  stroke="none"
                >
                  {repairData.map(
                    (_, index) => (
                      <Cell
                        key={`repair-${index}`}
                        fill={
                          CHART_COLORS[
                            index %
                              CHART_COLORS.length
                          ]
                        }
                      />
                    ),
                  )}
                </Pie>

                <Tooltip />

                <Legend
                  verticalAlign="bottom"
                  height={36}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>

        {/* ROOM OCCUPANCY CIRCULAR GRAPH */}

        <DashboardChartCard
          title="Room Occupancy"
          description="Rooms currently occupied"
        >
          <div className="occupancy-graph">
            <div
              className="occupancy-circle"
              style={{
                background: `conic-gradient(
                  #4f46e5 ${roomOccupancyRate}%,
                  #eef0f5 ${roomOccupancyRate}% 100%
                )`,
              }}
            >
              <div className="occupancy-circle-inner">
                <strong>
                  {roomOccupancyRate}%
                </strong>

                <span>Occupied</span>
              </div>
            </div>

            <div className="occupancy-summary">
              <div>
                <span>Occupied Rooms</span>

                <strong>
                  {occupiedRooms}
                </strong>
              </div>

              <div>
                <span>Available Rooms</span>

                <strong>
                  {availableRooms}
                </strong>
              </div>

              <div>
                <span>Total Rooms</span>

                <strong>
                  {totalRooms}
                </strong>
              </div>
            </div>
          </div>
        </DashboardChartCard>
      </section>

      {/* ================================
          HOSTELS
          ================================ */}

      <section className="hostel-summary">
        <div className="section-heading">
          <div>
            <h2>Your Hostels</h2>

            <p>
              Select a hostel to manage it.
            </p>
          </div>
        </div>

        {hostels.length === 0 ? (
          <div className="empty-state">
            No hostels found.
          </div>
        ) : (
          <div className="hostel-grid">
            {hostels.map((hostel) => (
              <button
                key={hostel.id}
                className={`hostel-card ${
                  selectedHostelId ===
                  hostel.id
                    ? "selected"
                    : ""
                }`}
                onClick={() => {
                  setSelectedHostelId(
                    hostel.id,
                  );

                  setPage("renters");
                }}
              >
                <h3>{hostel.name}</h3>

                <p>
                  {hostel.city ||
                    "Location not set"}

                  {hostel.state
                    ? `, ${hostel.state}`
                    : ""}
                </p>

                <span>
                  Manage →
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
    }

    if (page === "renters") {
      if (!selectedHostelId) {
        return (
          <div className="empty-state">
            <h3>Select a hostel first</h3>

            <p>
              Choose a hostel from the
              dashboard before managing renters.
            </p>
          </div>
        );
      }

      return (
        <Suspense fallback={<div className="loading-screen"><div className="loader"></div></div>}>
          <RenterManagement
            hostelId={selectedHostelId}
          />
        </Suspense>
      );
    }

    if (page === "hostels") {
      return (
        <section>
          <div className="page-heading">
            <div>
              <h1>Hostels</h1>

              <p>
                Manage your HostelDesk hostels.
              </p>
            </div>
          </div>

          {hostels.length === 0 ? (
            <div className="empty-state">
              No hostels found.
            </div>
          ) : (
            <div className="hostel-grid">
              {hostels.map((hostel) => (
                <div
                  className="hostel-card"
                  key={hostel.id}
                >
                  <h3>{hostel.name}</h3>

                  <p>
                    {hostel.address ||
                      "Address not set"}
                  </p>

                  <p>
                    {hostel.city || ""}

                    {hostel.state
                      ? `, ${hostel.state}`
                      : ""}
                  </p>

                  <button
                    className="primary-button"
                    onClick={() => {
                      setSelectedHostelId(
                        hostel.id,
                      );

                      setPage("renters");
                    }}
                  >
                    Manage Hostel
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    const pageNames: Record<
      Exclude<
        Page,
        "dashboard" | "renters" | "hostels"
      >,
      string
    > = {
      rooms: "Rooms",
      fees: "Fees",
      payments: "Payments",
      repairs: "Repairs",
      notifications: "Notifications",
    };

    if (page === "rooms") {
      if (!selectedHostelId) {
        return (
          <div className="empty-state">
            <h3>Select a hostel first</h3>
            <p>
              Choose a hostel before managing rooms.
            </p>
          </div>
        );
      }

      const activeRoomIds = new Set(
        roomRenters
          .filter(
            (renter) =>
              String(renter.status ?? "").toUpperCase() ===
              "ACTIVE" &&
              Boolean(renter.roomId),
          )
          .map((renter) => renter.roomId as string),
      );

      const activeRooms = rooms.filter(
        (room) =>
          String(room.status ?? "ACTIVE").toUpperCase() ===
          "ACTIVE",
      );

      const occupiedRooms = activeRooms.filter((room) =>
        activeRoomIds.has(room.id),
      ).length;

      const availableRooms =
        activeRooms.length - occupiedRooms;

      return (
        <section>
          <div className="page-heading">
            <div>
              <h1>Rooms</h1>
              <p>
                Add and manage rooms for the selected hostel.
              </p>
            </div>

            <button
              className="primary-button"
              onClick={() => {
                setRoomError("");
                setShowAddRoom(true);
              }}
              disabled={roomSaving}
            >
              + Add Room
            </button>
          </div>

          {roomError && (
            <div className="error-banner">
              {roomError}
            </div>
          )}

          <section className="cards">
            <DashboardCard
              title="Total Rooms"
              value={activeRooms.length}
            />
            <DashboardCard
              title="Available Rooms"
              value={availableRooms}
            />
            <DashboardCard
              title="Occupied Rooms"
              value={occupiedRooms}
            />
          </section>

          {showAddRoom && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 20,
                marginBottom: 24,
              }}
            >
              <div className="section-heading">
                <div>
                  <h2>Add Room</h2>
                  <p>
                    Create a room without beds or capacity.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                  alignItems: "end",
                }}
              >
                <div>
                  <label>Room Number</label>
                  <input
                    value={newRoomNumber}
                    onChange={(event) =>
                      setNewRoomNumber(event.target.value)
                    }
                    placeholder="e.g. 101"
                    disabled={roomSaving}
                  />
                </div>

                <div>
                  <label>Floor</label>
                  <input
                    value={newRoomFloor}
                    onChange={(event) =>
                      setNewRoomFloor(event.target.value)
                    }
                    placeholder="e.g. Ground"
                    disabled={roomSaving}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <button
                    className="primary-button"
                    onClick={addRoom}
                    disabled={roomSaving}
                  >
                    {roomSaving
                      ? "Saving..."
                      : "Save Room"}
                  </button>

                  <button
                    className="secondary-button"
                    onClick={() => {
                      setShowAddRoom(false);
                      setNewRoomNumber("");
                      setNewRoomFloor("");
                      setRoomError("");
                    }}
                    disabled={roomSaving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              className="section-heading"
              style={{ padding: "20px 20px 0" }}
            >
              <div>
                <h2>All Rooms</h2>
                <p>
                  {rooms.length} room
                  {rooms.length === 1 ? "" : "s"} found.
                </p>
              </div>
            </div>

            {roomsLoading ? (
              <div className="empty-state">
                Loading rooms...
              </div>
            ) : rooms.length === 0 ? (
              <div className="empty-state">
                <h3>No rooms yet</h3>
                <p>
                  Add your first room using the button above.
                </p>
              </div>
            ) : (
              <div
                style={{
                  overflowX: "auto",
                  padding: 20,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px 10px",
                          borderBottom:
                            "1px solid #e5e7eb",
                        }}
                      >
                        Room
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px 10px",
                          borderBottom:
                            "1px solid #e5e7eb",
                        }}
                      >
                        Floor
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "12px 10px",
                          borderBottom:
                            "1px solid #e5e7eb",
                        }}
                      >
                        Status
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "12px 10px",
                          borderBottom:
                            "1px solid #e5e7eb",
                        }}
                      >
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {rooms.map((room) => {
                      const isOccupied =
                        activeRoomIds.has(room.id);
                      const isActive =
                        String(
                          room.status ?? "ACTIVE",
                        ).toUpperCase() === "ACTIVE";

                      return (
                        <tr key={room.id}>
                          <td
                            style={{
                              padding: "14px 10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              fontWeight: 600,
                            }}
                          >
                            {room.roomNumber}
                          </td>

                          <td
                            style={{
                              padding: "14px 10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            {room.floor || "—"}
                          </td>

                          <td
                            style={{
                              padding: "14px 10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "5px 10px",
                                borderRadius: 999,
                                fontSize: 13,
                                fontWeight: 600,
                                background: !isActive
                                  ? "#f3f4f6"
                                  : isOccupied
                                    ? "#fee2e2"
                                    : "#dcfce7",
                                color: !isActive
                                  ? "#6b7280"
                                  : isOccupied
                                    ? "#b91c1c"
                                    : "#15803d",
                              }}
                            >
                              {!isActive
                                ? "Inactive"
                                : isOccupied
                                  ? "Occupied"
                                  : "Available"}
                            </span>
                          </td>

                          <td
                            style={{
                              padding: "14px 10px",
                              borderBottom:
                                "1px solid #f1f5f9",
                              textAlign: "right",
                            }}
                          >
                            <button
                              className="secondary-button"
                              onClick={() =>
                                deleteRoom(room)
                              }
                              disabled={
                                roomSaving ||
                                isOccupied
                              }
                              title={
                                isOccupied
                                  ? "Cannot delete a room with an active renter"
                                  : "Delete room"
                              }
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      );
    }

    if (page === "repairs") {
      if (!selectedHostelId) {
        return (
          <div className="empty-state">
            <h3>Select a hostel first</h3>
            <p>
              Choose a hostel before managing repairs and technicians.
            </p>
          </div>
        );
      }
      return (
        <Suspense fallback={<div className="loading-screen"><div className="loader"></div></div>}>
          <RepairManagement hostelId={selectedHostelId} />
        </Suspense>
      );
    }

    return (
      <div className="empty-state">
        <h2>
          {
            pageNames[
              page as Exclude<
                Page,
                "dashboard" |
                  "renters" |
                  "hostels" |
                  "repairs"
              >
            ]
          }
        </h2>

        <p>
          This module is coming next.
        </p>
      </div>
    );
  }

  if (initializing) {
    return (
      <div className="login-page" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <h2 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>HostelDesk</h2>
          <p>Restoring session...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand">
            HostelDesk
          </div>

          <h1>Portal Login</h1>

          <p className="subtitle">
            Admin & Staff Access Portal
          </p>

          <label>Email or Mobile Number</label>

          <input
            type="text"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            placeholder="e.g. admin@hosteldesk.com or 9876543210"
          />

          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Enter your password"
          />

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <button
            onClick={login}
            disabled={loading}
          >
            {loading
              ? "Signing in..."
              : "Login"}
          </button>

          <p
            style={{
              marginTop: 18,
              fontSize: 12.5,
              color: "#64748b",
              textAlign: "center",
              lineHeight: 1.45,
            }}
          >
            🔧 Repair technicians can enter their registered mobile number or email to access their Repair Portal.
          </p>
        </div>
      </div>
    );
  }

  // Repair technicians go ONLY to their dedicated Repair Portal!
  if (token && authUser?.role === "REPAIR_PERSON") {
    return (
      <Suspense fallback={<div className="loading-screen"><div className="loader"></div></div>}>
        <RepairPortal user={authUser} token={token} onLogout={logout} />
      </Suspense>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-brand">
          HostelDesk
        </div>

        <nav>
          <NavButton
            label="Dashboard"
            active={page === "dashboard"}
            onClick={() =>
              setPage("dashboard")
            }
          />

          <NavButton
            label="Hostels"
            active={page === "hostels"}
            onClick={() =>
              setPage("hostels")
            }
          />

          <NavButton
            label="Rooms"
            active={page === "rooms"}
            onClick={() => {
              setPage("rooms");
              if (selectedHostelId) {
                void loadRooms(selectedHostelId);
              }
            }}
          />

          <NavButton
            label="Renters"
            active={page === "renters"}
            onClick={() =>
              setPage("renters")
            }
          />

          <NavButton
            label="Fees"
            active={page === "fees"}
            onClick={() =>
              setPage("fees")
            }
          />

          <NavButton
            label="Payments"
            active={page === "payments"}
            onClick={() =>
              setPage("payments")
            }
          />

          <NavButton
            label="Repairs"
            active={page === "repairs"}
            onClick={() =>
              setPage("repairs")
            }
          />

          <NavButton
            label="Notifications"
            active={
              page === "notifications"
            }
            onClick={() =>
              setPage("notifications")
            }
          />
        </nav>

        <button
          className="sidebar-logout"
          onClick={logout}
        >
          Logout
        </button>
      </aside>

      <main className="main">
        <header className="header">
          <div>
            <h1>
              {page === "dashboard"
                ? "Dashboard"
                : page === "hostels"
                  ? "Hostels"
                  : page === "renters"
                    ? "Renters"
                    : page === "rooms"
                      ? "Rooms"
                      : page === "fees"
                        ? "Fees"
                        : page ===
                            "payments"
                          ? "Payments"
                          : page ===
                              "repairs"
                            ? "Repairs"
                            : "Notifications"}
            </h1>

            <p>
              {selectedHostelId &&
              page !== "dashboard" &&
              page !== "hostels"
                ? `Managing ${
                    hostels.find(
                      (hostel) =>
                        hostel.id ===
                        selectedHostelId,
                    )?.name ??
                    "selected hostel"
                  }`
                : "HostelDesk Admin Panel"}
            </p>
          </div>

          <div className="header-actions">
            {hostels.length > 0 && (
              <select
                className="hostel-selector"
                value={selectedHostelId}
                onChange={(event) => {
                  const hostelId = event.target.value;
                  setSelectedHostelId(hostelId);
                  setRoomError("");
                  if (page === "rooms") {
                    void loadRooms(hostelId);
                  }
                }}
              >
                {hostels.map((hostel) => (
                  <option
                    key={hostel.id}
                    value={hostel.id}
                  >
                    {hostel.name}
                  </option>
                ))}
              </select>
            )}

            <button
              className="logout"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </header>

        {error && page !== "dashboard" && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {renderPage()}
      </main>
    </div>
  );
}

function NavButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${
        active ? "active" : ""
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
function DashboardChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-chart-card">
      <div className="chart-card-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>

      {children}
    </div>
  );
}
function DashboardCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="dashboard-card">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;