import { db } from "../config/firebase.js";
import type {
  SendBulkSmsInput,
  SendSmsInput,
  SmsMessageModel,
  SmsProvider,
} from "../types/sms.js";

/**
 * Normalizes phone numbers to E.164-like standard (defaults to +91 if 10-digit Indian number)
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

/**
 * Dispatch SMS to external provider gateway (Twilio, Fast2SMS, MSG91, or Mock)
 */
async function dispatchSmsToProvider(
  phone: string,
  message: string,
): Promise<{ success: boolean; provider: SmsProvider; providerMessageId?: string; error?: string }> {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFromNumber = process.env.TWILIO_FROM_NUMBER;

  const fast2SmsApiKey = process.env.FAST2SMS_API_KEY;

  // 1. Twilio Integration
  if (twilioAccountSid && twilioAuthToken && twilioFromNumber) {
    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const authHeader = "Basic " + Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64");

      const params = new URLSearchParams();
      params.append("To", phone);
      params.append("From", twilioFromNumber);
      params.append("Body", message);

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = (await resp.json()) as any;
      if (resp.ok && data?.sid) {
        return {
          success: true,
          provider: "TWILIO",
          providerMessageId: data.sid,
        };
      } else {
        return {
          success: false,
          provider: "TWILIO",
          error: data?.message || "Twilio delivery failed",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: "TWILIO",
        error: err?.message || "Network error dispatching Twilio SMS",
      };
    }
  }

  // 2. Fast2SMS Integration (popular in India)
  if (fast2SmsApiKey) {
    try {
      const rawNumbers = phone.replace(/[^0-9]/g, "").slice(-10);
      const resp = await fetch("https://www.fast2sms.com/dev/bulkV2", {
        method: "POST",
        headers: {
          authorization: fast2SmsApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          route: "v3",
          sender_id: "TXTIND",
          message,
          language: "english",
          flash: 0,
          numbers: rawNumbers,
        }),
      });

      const data = (await resp.json()) as any;
      if (resp.ok && data?.return) {
        return {
          success: true,
          provider: "FAST2SMS",
          providerMessageId: data?.request_id || `fast2sms_${Date.now()}`,
        };
      } else {
        return {
          success: false,
          provider: "FAST2SMS",
          error: data?.message || "Fast2SMS delivery failed",
        };
      }
    } catch (err: any) {
      return {
        success: false,
        provider: "FAST2SMS",
        error: err?.message || "Network error dispatching Fast2SMS",
      };
    }
  }

  // 3. Fallback / Mock Gateway (Ready for when API credentials are provided)
  const mockId = `mock_sms_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  console.log(`[SMS Service - Mock Gateway] Simulated SMS sent to ${phone}: "${message.substring(0, 60)}..." (ID: ${mockId})`);

  return {
    success: true,
    provider: "MOCK",
    providerMessageId: mockId,
  };
}

/**
 * Service to manage and dispatch SMS messages to residents
 */
export const smsService = {
  /**
   * Send single SMS to a resident and record to Firestore
   */
  async sendSms(input: SendSmsInput): Promise<SmsMessageModel> {
    let targetPhone = input.phone;
    let recipientName = input.recipientName;

    // Resolve phone from renter / user if not directly provided
    if (!targetPhone && input.renterId) {
      const renterDoc = await db.collection("renters").doc(input.renterId).get();
      if (renterDoc.exists) {
        const rData = renterDoc.data() || {};
        targetPhone = rData.phone || rData.user?.phone;
        recipientName = recipientName || rData.name || rData.fullName || rData.user?.name;
      }
    }

    if (!targetPhone && input.userId) {
      const userDoc = await db.collection("users").doc(input.userId).get();
      if (userDoc.exists) {
        const uData = userDoc.data() || {};
        targetPhone = uData.phone;
        recipientName = recipientName || uData.firstName ? `${uData.firstName} ${uData.lastName || ""}`.trim() : uData.email;
      }
    }

    if (!targetPhone) {
      throw new Error("Recipient phone number is required to send an SMS");
    }

    const formattedPhone = formatPhoneNumber(targetPhone);
    const smsRef = db.collection("sms_messages").doc();
    const now = new Date().toISOString();

    const dispatchResult = await dispatchSmsToProvider(formattedPhone, input.message);

    const smsRecord: SmsMessageModel = {
      id: smsRef.id,
      hostelId: input.hostelId,
      renterId: input.renterId || null,
      userId: input.userId || null,
      recipientPhone: formattedPhone,
      recipientName: recipientName || null,
      message: input.message,
      senderId: input.senderId,
      status: dispatchResult.success ? "SENT" : "FAILED",
      type: input.type || "DIRECT",
      smsProvider: dispatchResult.provider,
      providerMessageId: dispatchResult.providerMessageId || null,
      failureReason: dispatchResult.error || null,
      sentAt: dispatchResult.success ? now : null,
      createdAt: now,
      metadata: input.metadata || {},
    };

    await smsRef.set(smsRecord);
    return smsRecord;
  },

  /**
   * Bulk send SMS to multiple active residents in a hostel
   */
  async sendBulkSms(input: SendBulkSmsInput): Promise<{
    total: number;
    sent: number;
    failed: number;
    messages: SmsMessageModel[];
  }> {
    let rentersQuery = db.collection("renters").where("status", "==", "ACTIVE");

    if (input.hostelId && input.hostelId !== "ALL") {
      rentersQuery = rentersQuery.where("hostelId", "==", input.hostelId);
    }

    const rentersSnap = await rentersQuery.get();
    const messages: SmsMessageModel[] = [];
    let sentCount = 0;
    let failedCount = 0;

    const targetRenters = rentersSnap.docs.filter((doc) => {
      if (!input.renterIds || input.renterIds.length === 0) return true;
      return input.renterIds.includes(doc.id);
    });

    for (const renterDoc of targetRenters) {
      const data = renterDoc.data();
      const phone = data.phone || data.user?.phone;
      if (!phone) continue;

      try {
        const record = await this.sendSms({
          hostelId: data.hostelId || input.hostelId,
          renterId: renterDoc.id,
          userId: data.userId || null,
          phone,
          recipientName: data.name || data.fullName,
          message: input.message,
          senderId: input.senderId,
          type: input.type || "BROADCAST",
          metadata: input.metadata,
        });

        messages.push(record);
        if (record.status === "SENT") {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (err: any) {
        failedCount++;
      }
    }

    return {
      total: targetRenters.length,
      sent: sentCount,
      failed: failedCount,
      messages,
    };
  },

  /**
   * Fetch SMS dispatch history for a hostel
   */
  async getSmsHistory(hostelId: string, limit = 50): Promise<SmsMessageModel[]> {
    let query = db.collection("sms_messages") as FirebaseFirestore.Query;

    if (hostelId && hostelId !== "ALL") {
      query = query.where("hostelId", "==", hostelId);
    }

    const snap = await query.orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SmsMessageModel[];
  },

  /**
   * Fetch a single SMS message status by ID
   */
  async getSmsById(smsId: string): Promise<SmsMessageModel | null> {
    const doc = await db.collection("sms_messages").doc(smsId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as SmsMessageModel;
  },
};
