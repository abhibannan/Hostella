import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { smsService } from "../../services/sms.service.js";

const router = Router();

const sendSmsSchema = z.object({
  hostelId: z.string().min(1),
  renterId: z.string().optional(),
  userId: z.string().optional(),
  phone: z.string().optional(),
  recipientName: z.string().optional(),
  message: z.string().trim().min(1).max(500),
  type: z
    .enum([
      "BROADCAST",
      "DIRECT",
      "FEE_REMINDER",
      "OVERDUE_ALERT",
      "ANNOUNCEMENT",
      "CUSTOM",
    ])
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const sendBulkSmsSchema = z.object({
  hostelId: z.string().min(1),
  renterIds: z.array(z.string()).optional(),
  message: z.string().trim().min(1).max(500),
  type: z
    .enum([
      "BROADCAST",
      "DIRECT",
      "FEE_REMINDER",
      "OVERDUE_ALERT",
      "ANNOUNCEMENT",
      "CUSTOM",
    ])
    .optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/v1/sms/send
 * Send a direct SMS to a resident
 */
router.post("/send", requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "PARTNER") {
      res.status(403).json({ message: "Only administrators can send SMS messages" });
      return;
    }

    const parsed = sendSmsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid SMS payload",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await smsService.sendSms({
      hostelId: parsed.data.hostelId,
      renterId: parsed.data.renterId,
      userId: parsed.data.userId,
      phone: parsed.data.phone,
      recipientName: parsed.data.recipientName,
      message: parsed.data.message,
      senderId: req.authUser!.id,
      type: parsed.data.type,
      metadata: parsed.data.metadata,
    });

    res.status(201).json({
      message: "SMS processed successfully",
      sms: result,
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/v1/sms/broadcast
 * Send bulk SMS messages to residents of a hostel
 */
router.post("/broadcast", requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "PARTNER") {
      res.status(403).json({ message: "Only administrators can broadcast SMS messages" });
      return;
    }

    const parsed = sendBulkSmsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid bulk SMS payload",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const result = await smsService.sendBulkSms({
      hostelId: parsed.data.hostelId,
      renterIds: parsed.data.renterIds,
      message: parsed.data.message,
      senderId: req.authUser!.id,
      type: parsed.data.type,
      metadata: parsed.data.metadata,
    });

    res.status(201).json({
      message: `SMS batch processed: ${result.sent} sent, ${result.failed} failed of ${result.total}`,
      summary: result,
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/v1/sms/history
 * Retrieve SMS dispatch logs for a hostel
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "PARTNER") {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const hostelId = (req.query.hostelId as string) || "ALL";
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const history = await smsService.getSmsHistory(hostelId, limit);
    res.json({ history });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/v1/sms/:smsId
 * Retrieve specific SMS message status
 */
router.get("/:smsId", requireAuth, async (req, res, next) => {
  try {
    const role = req.authUser?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN" && role !== "PARTNER") {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    const smsId = String(req.params.smsId || "");
    if (!smsId) {
      res.status(400).json({ message: "Invalid SMS ID" });
      return;
    }

    const sms = await smsService.getSmsById(smsId);
    if (!sms) {
      res.status(404).json({ message: "SMS record not found" });
      return;
    }

    res.json({ sms });
  } catch (error: any) {
    next(error);
  }
});

export default router;
