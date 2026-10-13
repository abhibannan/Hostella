export type SmsStatus = "PENDING" | "SENT" | "DELIVERED" | "FAILED" | "QUEUED";

export type SmsMessageType =
  | "BROADCAST"
  | "DIRECT"
  | "FEE_REMINDER"
  | "OVERDUE_ALERT"
  | "ANNOUNCEMENT"
  | "CUSTOM";

export type SmsProvider = "TWILIO" | "FAST2SMS" | "MSG91" | "MOCK" | "CUSTOM";

export interface SmsMessageModel {
  id: string;
  hostelId: string;
  renterId?: string | null | undefined;
  userId?: string | null | undefined;
  recipientPhone: string;
  recipientName?: string | null | undefined;
  message: string;
  senderId: string;
  status: SmsStatus;
  type: SmsMessageType;
  smsProvider?: SmsProvider | undefined;
  providerMessageId?: string | null | undefined;
  failureReason?: string | null | undefined;
  sentAt?: string | null | undefined;
  createdAt: string;
  metadata?: Record<string, any> | undefined;
}

export interface SendSmsInput {
  hostelId: string;
  renterId?: string | null | undefined;
  userId?: string | null | undefined;
  phone?: string | undefined;
  recipientName?: string | null | undefined;
  message: string;
  senderId: string;
  type?: SmsMessageType | undefined;
  metadata?: Record<string, any> | undefined;
}

export interface SendBulkSmsInput {
  hostelId: string;
  renterIds?: string[] | undefined;
  message: string;
  senderId: string;
  type?: SmsMessageType | undefined;
  metadata?: Record<string, any> | undefined;
}
