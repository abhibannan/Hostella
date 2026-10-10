import type { Request, Response, NextFunction } from "express";
import { getPlatformConfig } from "../services/telemetry.service.js";
import { resolveAuthUserFromToken } from "./auth.middleware.js";

export async function maintenanceMiddleware(req: Request, res: Response, next: NextFunction) {
  const config = getPlatformConfig();
  if (!config.maintenanceMode) {
    return next();
  }

  const path = req.originalUrl || req.path || "";

  // 1. Critical discovery & profile discovery endpoints remain open during maintenance mode
  // This allows the app to fetch /platform/status and verify user role via /auth/me
  if (
    path.includes("/health") ||
    path.includes("/platform/status") ||
    path.includes("/auth/me") ||
    path.includes("/auth/bootstrap") ||
    path.includes("/auth/login-lookup") ||
    path.includes("/auth/forgot-password")
  ) {
    return next();
  }

  // 2. Check if request belongs to an authenticated Super Admin
  if ((req as any).authUser?.role === "SUPER_ADMIN") {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const resolved = await resolveAuthUserFromToken(token);
        if (resolved?.authUser.role === "SUPER_ADMIN") {
          req.authUser = resolved.authUser;
          req.firebaseUser = resolved.firebaseUser;
          return next();
        }
      } catch {
        // Fall through to 503
      }
    }
  }

  // 3. All other traffic from non-super admins receives 503 Service Unavailable
  res.status(503).json({
    code: "MAINTENANCE_MODE",
    message:
      config.maintenanceNotice ||
      "Hostella is currently undergoing scheduled platform maintenance. Services will resume shortly.",
    alertBanner: config.alertBanner.active ? config.alertBanner : undefined,
  });
}
