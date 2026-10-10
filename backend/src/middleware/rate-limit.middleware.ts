import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimitOptions {
  windowMs: number; // e.g. 60 * 1000 (1 minute)
  maxRequests: number; // max requests within window
  message?: string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, message = "Too many requests, please try again later.", skip } = options;
  const store = new Map<string, RateLimitRecord>();

  // Cleanup expired entries every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 2 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    // Always bypass preflight CORS OPTIONS requests
    if (req.method === "OPTIONS") {
      return next();
    }

    if (skip && skip(req)) {
      return next();
    }

    // Identify client by IP or auth header
    const ip = req.ip || req.socket.remoteAddress || "anonymous";
    const key = `${req.baseUrl || ""}_${ip}`;
    const now = Date.now();

    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      store.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", maxRequests);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader("Retry-After", resetSeconds);
      return res.status(429).json({
        error: "Too Many Requests",
        message,
        retryAfterSeconds: resetSeconds,
      });
    }

    next();
  };
}

/** Standard limiter for API endpoints: 300 requests / minute */
export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  message: "Too many requests to Hostella API. Please throttle your client.",
});

/** Limiter for Auth endpoints: 60 requests / 10 minutes, skips /auth/me checks */
export const authRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 60,
  message: "Too many authentication attempts. Please try again in a few minutes.",
  skip: (req) => req.path === "/me" || req.url === "/me",
});
