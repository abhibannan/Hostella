import app from "./app.js";
import { env } from "./config/env.js";
import { startRecurringFeesCron } from "./services/recurring-fees.service.js";

const server = app.listen(env.PORT, () => {
  console.log(`Hostella API running on http://localhost:${env.PORT}`);
  console.log("Database: Firebase Firestore");
  startRecurringFeesCron();
});

const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Shutting down...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
