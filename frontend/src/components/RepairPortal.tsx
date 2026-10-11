import { useEffect, useMemo, useState } from "react";
import { auth } from "../firebase";

const API_URL = "http://localhost:3000/api/v1";

type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  role: string;
  specialty?: string | null;
};

type Hostel = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  address?: string | null;
};

type Repair = {
  id: string;
  hostelId: string;
  renterId?: string;
  roomId?: string | null;
  bedId?: string | null;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  adminNotes?: string | null;
  assignedTo?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
};

type Room = {
  id: string;
  roomNumber: string;
  floor?: string | null;
};

type Renter = {
  id: string;
  roomId: string;
  user?: {
    firstName: string;
    lastName?: string;
    phone?: string;
    email?: string;
  } | null;
};

type Props = {
  user: AuthUser;
  token: string;
  onLogout: () => void;
};

export default function RepairPortal({ user, token, onLogout }: Props) {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [selectedHostelId, setSelectedHostelId] = useState<string>("");
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [renters, setRenters] = useState<Renter[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState<"ALL" | "SUBMITTED" | "IN_PROGRESS" | "RESOLVED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Action Modal
  const [activeRepair, setActiveRepair] = useState<Repair | null>(null);
  const [modalStatus, setModalStatus] = useState<"IN_PROGRESS" | "RESOLVED">("IN_PROGRESS");
  const [modalNotes, setModalNotes] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  useEffect(() => {
    loadHostels();
  }, []);

  useEffect(() => {
    if (selectedHostelId) {
      loadHostelRepairs(selectedHostelId);
    }
  }, [selectedHostelId]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function apiRequest(path: string, options: RequestInit = {}) {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : token;
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(options.headers ?? {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `Request failed (${response.status})`);
    }
    return data;
  }

  async function loadHostels() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest("/hostels");
      const list = res.hostels || [];
      setHostels(list);
      if (list.length > 0) {
        setSelectedHostelId(list[0].id);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load assigned hostels");
      setLoading(false);
    }
  }

  async function loadHostelRepairs(hostelId: string) {
    try {
      setRefreshing(true);
      setError("");
      const [repairsRes, roomsRes, rentersRes] = await Promise.all([
        apiRequest(`/hostels/${hostelId}/repairs`).catch(() => ({ repairs: [] })),
        apiRequest(`/hostels/${hostelId}/rooms`).catch(() => ({ rooms: [] })),
        apiRequest(`/hostels/${hostelId}/renters`).catch(() => ({ renters: [] })),
      ]);

      setRepairs(repairsRes.repairs || []);
      setRooms(roomsRes.rooms || []);
      setRenters(rentersRes.renters || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load repairs list");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Quick action: start working
  async function handleStartJob(repair: Repair) {
    try {
      setActionSaving(true);
      const technicianName = `${user.firstName} ${user.lastName || ""}`.trim();
      await apiRequest(`/hostels/${selectedHostelId}/repairs/${repair.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "IN_PROGRESS",
          assignedTo: technicianName,
          adminNotes: repair.adminNotes
            ? `${repair.adminNotes}\n[${new Date().toLocaleTimeString()} - Started by ${technicianName}]`
            : `Started by ${technicianName} at ${new Date().toLocaleTimeString()}`,
        }),
      });

      showToast("Job status updated to IN PROGRESS!");
      await loadHostelRepairs(selectedHostelId);
    } catch (err: any) {
      setError(err?.message || "Failed to start job");
    } finally {
      setActionSaving(false);
    }
  }

  // Submit modal update
  async function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRepair) return;

    try {
      setActionSaving(true);
      setError("");
      const technicianName = `${user.firstName} ${user.lastName || ""}`.trim();
      const existingNotes = activeRepair.adminNotes || "";
      const noteEntry = modalNotes.trim()
        ? `${existingNotes ? existingNotes + "\n" : ""}[${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} - ${technicianName}]: ${modalNotes.trim()}`
        : existingNotes;

      await apiRequest(`/hostels/${selectedHostelId}/repairs/${activeRepair.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: modalStatus,
          assignedTo: technicianName,
          adminNotes: noteEntry || undefined,
        }),
      });

      setActiveRepair(null);
      setModalNotes("");
      showToast(modalStatus === "RESOLVED" ? "Repair marked as RESOLVED! Great job." : "Work notes updated!");
      await loadHostelRepairs(selectedHostelId);
    } catch (err: any) {
      setError(err?.message || "Failed to update repair");
    } finally {
      setActionSaving(false);
    }
  }

  const roomMap = useMemo(() => new Map(rooms.map((r) => [r.id, r.roomNumber])), [rooms]);
  const renterMap = useMemo(() => new Map(renters.map((r) => [r.id, r])), [renters]);

  // Counts
  const countSubmitted = repairs.filter((r) => (r.status || "SUBMITTED") === "SUBMITTED").length;
  const countInProgress = repairs.filter((r) => r.status === "IN_PROGRESS").length;
  const countResolved = repairs.filter((r) => r.status === "RESOLVED").length;

  const filteredRepairs = useMemo(() => {
    return repairs.filter((r) => {
      const status = (r.status || "SUBMITTED").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const roomNum = r.roomId ? roomMap.get(r.roomId)?.toLowerCase() || "" : "";
        const title = (r.title || "").toLowerCase();
        const desc = (r.description || "").toLowerCase();
        return roomNum.includes(q) || title.includes(q) || desc.includes(q);
      }
      return true;
    });
  }, [repairs, statusFilter, searchQuery, roomMap]);

  const selectedHostel = hostels.find((h) => h.id === selectedHostelId);

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ─────────────────────────────────────────────────────────────
          PORTAL TOPBAR
          ───────────────────────────────────────────────────────────── */}
      <header
        style={{
          background: "#1e1b4b",
          color: "#fff",
          padding: "16px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              boxShadow: "0 2px 10px rgba(99,102,241,0.4)",
            }}
          >
            🛠️
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>Hostella</h1>
              <span
                style={{
                  background: "#4338ca",
                  color: "#e0e7ff",
                  padding: "2px 8px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Repairs Portal
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#c7d2fe" }}>
              Technician Workspace • {user.firstName} {user.lastName || ""} {user.specialty ? `(${user.specialty})` : ""}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          {hostels.length > 1 && (
            <select
              value={selectedHostelId}
              onChange={(e) => setSelectedHostelId(e.target.value)}
              style={{
                background: "#312e81",
                color: "#fff",
                border: "1px solid #4338ca",
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {hostels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(255,255,255,0.08)",
              padding: "6px 14px",
              borderRadius: 30,
              fontSize: 13,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80" }} />
            <span>{selectedHostel?.name || "Assigned Hostel"}</span>
          </div>

          <button
            onClick={onLogout}
            style={{
              background: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: "8px 16px",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          PORTAL MAIN CONTENT
          ───────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px" }}>
        {/* Toast / Error */}
        {toast && (
          <div
            style={{
              background: "#10b981",
              color: "#fff",
              padding: "12px 18px",
              borderRadius: 10,
              marginBottom: 20,
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
            }}
          >
            ✓ {toast}
          </div>
        )}
        {error && (
          <div
            style={{
              background: "#ef4444",
              color: "#fff",
              padding: "12px 18px",
              borderRadius: 10,
              marginBottom: 20,
              fontWeight: 600,
            }}
          >
            ✕ {error}
          </div>
        )}

        {/* KPI Cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div
            onClick={() => setStatusFilter("ALL")}
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              padding: "20px 24px",
              borderRadius: 14,
              border: statusFilter === "ALL" ? "2px solid #4f46e5" : "1px solid #e2e8f0",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Total Jobs</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginTop: 4 }}>{repairs.length}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>All logged tickets</div>
          </div>

          <div
            onClick={() => setStatusFilter("SUBMITTED")}
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              padding: "20px 24px",
              borderRadius: 14,
              border: statusFilter === "SUBMITTED" ? "2px solid #d97706" : "1px solid #e2e8f0",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: 13, color: "#d97706", fontWeight: 700, textTransform: "uppercase" }}>Needs Attention</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#d97706", marginTop: 4 }}>{countSubmitted}</div>
            <div style={{ fontSize: 12, color: "#b45309", marginTop: 4 }}>Pending / Reported</div>
          </div>

          <div
            onClick={() => setStatusFilter("IN_PROGRESS")}
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              padding: "20px 24px",
              borderRadius: 14,
              border: statusFilter === "IN_PROGRESS" ? "2px solid #7c3aed" : "1px solid #e2e8f0",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: 13, color: "#7c3aed", fontWeight: 700, textTransform: "uppercase" }}>In Progress</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#7c3aed", marginTop: 4 }}>{countInProgress}</div>
            <div style={{ fontSize: 12, color: "#6d28d9", marginTop: 4 }}>Currently working</div>
          </div>

          <div
            onClick={() => setStatusFilter("RESOLVED")}
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              padding: "20px 24px",
              borderRadius: 14,
              border: statusFilter === "RESOLVED" ? "2px solid #16a34a" : "1px solid #e2e8f0",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 700, textTransform: "uppercase" }}>Completed</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: "#16a34a", marginTop: 4 }}>{countResolved}</div>
            <div style={{ fontSize: 12, color: "#15803d", marginTop: 4 }}>Fixed & Resolved</div>
          </div>
        </section>

        {/* Filter bar & Search */}
        <section
          style={{
            background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
            borderRadius: 14,
            border: "1px solid rgba(255, 255, 255, 0.1)",
            padding: "16px 20px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["ALL", "SUBMITTED", "IN_PROGRESS", "RESOLVED"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: statusFilter === tab ? "#4f46e5" : "#f1f5f9",
                  color: statusFilter === tab ? "#fff" : "#475569",
                  transition: "all 0.15s ease",
                }}
              >
                {tab === "ALL"
                  ? "All Tasks"
                  : tab === "SUBMITTED"
                    ? "Pending"
                    : tab === "IN_PROGRESS"
                      ? "In Progress"
                      : "Resolved"}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 300px", maxWidth: 450 }}>
            <input
              type="text"
              placeholder="Search by room, issue, keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontSize: 13.5,
              }}
            />
            <button
              onClick={() => selectedHostelId && loadHostelRepairs(selectedHostelId)}
              disabled={refreshing}
              style={{
                background: "#020617",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                padding: "9px 14px",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {refreshing ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>
        </section>

        {/* Jobs List */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading maintenance tasks...</div>
        ) : filteredRepairs.length === 0 ? (
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              borderRadius: 14,
              border: "1px solid rgba(255, 255, 255, 0.1)",
              padding: 60,
              textAlign: "center",
              color: "#94a3b8",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ margin: 0, fontSize: 18, color: "#fff" }}>No repairs found</h3>
            <p style={{ marginTop: 6, fontSize: 14 }}>
              {statusFilter === "ALL"
                ? "There are no repair tickets at this hostel right now."
                : `No repair tickets with status "${statusFilter}".`}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {filteredRepairs.map((r) => {
              const roomNum = r.roomId ? roomMap.get(r.roomId) : null;
              const renter = r.renterId ? renterMap.get(r.renterId) : null;
              const renterName = renter?.user
                ? `${renter.user.firstName} ${renter.user.lastName || ""}`.trim()
                : null;
              const renterPhone = renter?.user?.phone || null;

              const isUrgent = r.priority === "URGENT";
              const isResolved = r.status === "RESOLVED";
              const isInProgress = r.status === "IN_PROGRESS";

              return (
                <div
                  key={r.id}
                  style={{
                    background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
                    borderRadius: 14,
                    border: isUrgent && !isResolved ? "2px solid #f87171" : "1px solid #e2e8f0",
                    padding: 22,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Top Bar: Room + Priority + Status */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      {roomNum ? (
                        <div
                          style={{
                            background: "#4f46e5",
                            color: "#fff",
                            padding: "6px 14px",
                            borderRadius: 8,
                            fontWeight: 800,
                            fontSize: 15,
                            letterSpacing: -0.2,
                          }}
                        >
                          Room {roomNum}
                        </div>
                      ) : (
                        <div
                          style={{
                            background: "#64748b",
                            color: "#fff",
                            padding: "6px 12px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          Common Area
                        </div>
                      )}

                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>{r.title}</h3>

                      {/* Priority Tag */}
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 800,
                          textTransform: "uppercase",
                          background:
                            r.priority === "URGENT"
                              ? "#fee2e2"
                              : r.priority === "HIGH"
                                ? "#ffedd5"
                                : r.priority === "LOW"
                                  ? "#f1f5f9"
                                  : "#e0e7ff",
                          color:
                            r.priority === "URGENT"
                              ? "#b91c1c"
                              : r.priority === "HIGH"
                                ? "#c2410c"
                                : r.priority === "LOW"
                                  ? "#475569"
                                  : "#4338ca",
                        }}
                      >
                        {r.priority} PRIORITY
                      </span>

                      {/* Status Tag */}
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background:
                            isResolved
                              ? "#dcfce7"
                              : isInProgress
                                ? "#ede9fe"
                                : "#fef3c7",
                          color:
                            isResolved
                              ? "#15803d"
                              : isInProgress
                                ? "#6d28d9"
                                : "#92400e",
                        }}
                      >
                        {isResolved ? "RESOLVED" : isInProgress ? "IN PROGRESS" : "NEEDS ACTION"}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!isResolved && !isInProgress && (
                        <button
                          onClick={() => handleStartJob(r)}
                          disabled={actionSaving}
                          style={{
                            background: "#4f46e5",
                            color: "#fff",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(79,70,229,0.3)",
                          }}
                        >
                          ▶ Start Working
                        </button>
                      )}

                      {!isResolved && (
                        <button
                          onClick={() => {
                            setActiveRepair(r);
                            setModalStatus("RESOLVED");
                            setModalNotes("");
                          }}
                          disabled={actionSaving}
                          style={{
                            background: "#16a34a",
                            color: "#fff",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(22,163,74,0.3)",
                          }}
                        >
                          ✓ Mark Resolved
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setActiveRepair(r);
                          setModalStatus(r.status === "RESOLVED" ? "RESOLVED" : "IN_PROGRESS");
                          setModalNotes("");
                        }}
                        style={{
                          background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
                          color: "#cbd5e1",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          padding: "8px 14px",
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        ✎ Add Work Notes
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      background: "#020617",
                      padding: "12px 16px",
                      borderRadius: 10,
                      fontSize: 14.5,
                      color: "#e2e8f0",
                      lineHeight: 1.55,
                    }}
                  >
                    {r.description}
                  </div>

                  {/* Existing Notes */}
                  {r.adminNotes && (
                    <div
                      style={{
                        background: "#f0fdf4",
                        borderLeft: "4px solid #22c55e",
                        padding: "10px 14px",
                        borderRadius: "0 8px 8px 0",
                        fontSize: 13.5,
                        color: "#166534",
                        whiteSpace: "pre-line",
                      }}
                    >
                      <strong>Work Progress & Notes:</strong>
                      <p style={{ margin: "4px 0 0", color: "#14532d" }}>{r.adminNotes}</p>
                    </div>
                  )}

                  {/* Footer Meta */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                      paddingTop: 12,
                      fontSize: 13,
                      color: "#94a3b8",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      {renterName && (
                        <div>
                          <strong>Resident:</strong> {renterName}{" "}
                          {renterPhone && (
                            <a
                              href={`tel:${renterPhone}`}
                              style={{ color: "#4f46e5", textDecoration: "none", fontWeight: 600, marginLeft: 4 }}
                            >
                              📞 {renterPhone}
                            </a>
                          )}
                        </div>
                      )}
                      <div>
                        <strong>Reported:</strong> {new Date(r.createdAt).toLocaleString()}
                      </div>
                      {r.resolvedAt && (
                        <div style={{ color: "#15803d" }}>
                          <strong>Resolved At:</strong> {new Date(r.resolvedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {r.assignedTo && (
                      <div>
                        <strong>Assigned:</strong> <span style={{ color: "#4338ca", fontWeight: 600 }}>{r.assignedTo}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: UPDATE STATUS & RESOLUTION NOTES
          ───────────────────────────────────────────────────────────── */}
      {activeRepair && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              padding: 28,
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#fff" }}>Update Job Progress</h2>
            <p style={{ margin: "0 0 18px", color: "#94a3b8", fontSize: 14 }}>
              <strong>{activeRepair.title}</strong>
              {activeRepair.roomId && ` • Room ${roomMap.get(activeRepair.roomId) || ""}`}
            </p>

            <form onSubmit={handleModalSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#e2e8f0" }}>
                  Status
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    fontSize: 14,
                    background: "rgba(30, 41, 59, 0.6)", backdropFilter: "blur(12px)",
                  }}
                >
                  <option value="IN_PROGRESS">In Progress (Still Working)</option>
                  <option value="RESOLVED">Resolved (Work Completed)</option>
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6, color: "#e2e8f0" }}>
                  Technician Notes / Details
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe the action taken (e.g. replaced washer, fixed wiring, tested water pressure)..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    fontSize: 14,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setActiveRepair(null)}
                  disabled={actionSaving}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    background: "rgba(255, 255, 255, 0.05)",
                    color: "#cbd5e1",
                    border: "none",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionSaving}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 8,
                    background: modalStatus === "RESOLVED" ? "#16a34a" : "#4f46e5",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  {actionSaving ? "Saving..." : modalStatus === "RESOLVED" ? "Mark as Resolved" : "Save Progress"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
