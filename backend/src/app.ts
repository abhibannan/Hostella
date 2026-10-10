import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";

import { env } from "./config/env.js";
import apiRouter from "./routes/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

import { telemetryMiddleware } from "./services/telemetry.service.js";
import { maintenanceMiddleware } from "./middleware/maintenance.middleware.js";
import { generalApiLimiter, authRateLimiter } from "./middleware/rate-limit.middleware.js";

const app = express();

// Trust reverse proxy (Render, Cloudflare, AWS) so each user's real IP is tracked independently
app.set("trust proxy", 1);

app.disable("x-powered-by");

app.use(helmet());
app.use(compression());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, native clients, curl)
      if (!origin) return callback(null, true);
      // Reflect origin so browsers accept credentials with any local or deployed port
      return callback(null, true);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "20mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb",
  }),
);

// Track legitimate API traffic telemetry
app.use(telemetryMiddleware);

// Rate limiting on API and Auth endpoints
app.use("/api/v1/auth", authRateLimiter);
app.use("/api/v1", generalApiLimiter);

// Protect platform during maintenance mode
app.use("/api/v1", maintenanceMiddleware);

app.use("/api/v1", apiRouter);

// 404 handler for API routes
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
});

// Global error handler
app.use(errorMiddleware);

export default app;