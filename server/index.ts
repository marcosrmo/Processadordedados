import express from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import { registerRoutes } from "./routes";
import { registerAuthRoutes } from "./auth";
import { registerAuditRoutes } from "./auditRoutes";
import cors from "cors";

const MemStore = MemoryStore(session);
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dataforge-secret-2026",
    resave: false,
    saveUninitialized: false,
    store: new MemStore({ checkPeriod: 86400000 }),
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
      sameSite: "lax",
    },
  })
);

(async () => {
  // Auth + Audit routes before Vite catch-all
  registerAuthRoutes(app);
  registerAuditRoutes(app);

  const server = await registerRoutes(app);

  const PORT = Number(process.env.PORT) || 5000;

  if (process.env.NODE_ENV === "production") {
    const { serveStatic } = await import("./static");
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(server, app);
  }

  server.setTimeout(60 * 60 * 1000);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[BACKEND] Servidor rodando em 0.0.0.0:${PORT}`);
  });
})();
