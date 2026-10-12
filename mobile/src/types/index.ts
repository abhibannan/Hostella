export type Tab = "dashboard" | "hostels" | "rooms" | "renters" | "fees" | "payments" | "repairs" | "more" | "notifications";

export type Hostel = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  type?: string;
  contactPhone?: string;
  pincode?: string;
  totalRooms?: number;
};

export type Room = {
  id: string;
  hostelId?: string;
  roomNumber: string;
  floor?: string | number;
  status?: string;
  maxOccupants?: number;
  description?: string | null;
  amenities?: string | null;
};


export type Renter = {
  id: string;
  userId?: string;
  hostelId?: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  guardianName?: string;
  guardianPhone?: string;
  status?: string;
  roomId?: string;
  joiningDate?: string;
  monthlyFee?: number;
  securityDeposit?: number;
  bed?: string | number | null;
  dueDateDay?: number | null;
  user?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    profilePhotoUrl?: string | null;
    dateOfBirth?: string | null;
    gender?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  };
  room?: {
    id?: string;
    roomNumber?: string;
    floor?: string | number | null;
  };
};

export type Fee = {
  id: string;
  hostelId?: string;
  renterId: string;
  month: string;
  amount: number;
  paidAmount?: number;
  dueDate: string;
  description?: string;
  status?: string;
  createdAt?: string;
  renter?: any;
  room?: any;
};

export type Payment = {
  id: string;
  hostelId?: string;
  renterId?: string;
  feeId?: string;
  amount?: number;
  paymentDate?: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  proofUploadId?: string;
  proofUrl?: string;
  status?: string;
  reviewNote?: string;
  submittedAt?: string;
  reviewedAt?: string;
  createdAt?: string;
};

export type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "RENTER" | "REPAIR_PERSON" | "PARTNER";
  status?: string;
};

export type Partner = {
  id: string;
  hostelId: string;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  assignedAt: string;
  createdAt?: string;
};

export type PlatformOverview = {
  totalHostels: number;
  totalAdmins: number;
  activeAdmins: number;
  totalRooms: number;
  totalBeds: number;
  totalActiveRenters: number;
};

export type AdminAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  role: "SUPER_ADMIN" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  assignedHostels?: Array<{ hostelId: string; hostelName: string }>;
};

export type RepairPerson = {
  id: string;
  hostelId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  specialty?: string;
  status: string;
  createdAt: string;
};

export type RenterTab = "details" | "fees" | "repairs";

export type Notification = {
  id: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  hostelId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  senderId?: string | null;
  createdBy?: string | null;
  sentByMe?: boolean;
  read: boolean;
  createdAt: string;
  readAt?: string | null;
};

export type SmsMessage = {
  id: string;
  hostelId: string;
  renterId?: string | null;
  userId?: string | null;
  recipientPhone: string;
  recipientName?: string | null;
  message: string;
  senderId: string;
  status: "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "QUEUED";
  type: "BROADCAST" | "DIRECT" | "FEE_REMINDER" | "OVERDUE_ALERT" | "ANNOUNCEMENT" | "CUSTOM";
  smsProvider?: "TWILIO" | "FAST2SMS" | "MSG91" | "MOCK" | "CUSTOM";
  providerMessageId?: string | null;
  failureReason?: string | null;
  sentAt?: string | null;
  createdAt: string;
  metadata?: Record<string, any>;
};

export type Repair = {
  id: string;
  hostelId?: string;
  renterId?: string;
  roomId?: string;
  title: string;
  description: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status?: "SUBMITTED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  adminNotes?: string | null;
  assignedTo?: string | null;
  assignedRepairPersonId?: string | null;
  beforePhotoUrl?: string | null;
  resolvedPhotoUrl?: string | null;
  rating?: number | null;
  feedback?: string | null;
  ratedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ExpenseCategory = "ELECTRICITY" | "WATER" | "SALARY" | "INTERNET" | "MAINTENANCE" | "FOOD" | "OTHER";

export type Expense = {
  id: string;
  hostelId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  month?: string;
  notes?: string;
  receiptUrl?: string;
  paidBy?: string;
  createdAt?: string;
};

export type MaintenanceTask = {
  id: string;
  hostelId: string;
  title: string;
  description?: string;
  category?: string;
  frequency: "ONE_TIME" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "BIANNUAL" | "ANNUAL";
  scheduledDate: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
  assignedTo?: string | null;
  assignedPersonName?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Dashboard = {
  totalRooms: number;
  activeRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  activeRenters: number;
  totalFees: number;
  paidFees: number;
  pendingFees: number;
  partiallyPaidFees: number;
  overdueFees: number;
  outstandingFees: number;
  totalPayments: number;
  paidPayments: number;
  pendingPayments: number;
  totalRepairRequests: number;
  submittedRepairs: number;
  inProgressRepairs: number;
  resolvedRepairs: number;
  cancelledRepairs: number;
};

export const EMPTY_DASHBOARD: Dashboard = {
  totalRooms: 0,
  activeRooms: 0,
  occupiedRooms: 0,
  availableRooms: 0,
  activeRenters: 0,
  totalFees: 0,
  paidFees: 0,
  pendingFees: 0,
  partiallyPaidFees: 0,
  overdueFees: 0,
  outstandingFees: 0,
  totalPayments: 0,
  paidPayments: 0,
  pendingPayments: 0,
  totalRepairRequests: 0,
  submittedRepairs: 0,
  inProgressRepairs: 0,
  resolvedRepairs: 0,
  cancelledRepairs: 0,
};
