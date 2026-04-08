import { Express } from "express";
import adminRouter from "./admin.js";
import parkingRouter from "./parking.js";
import healthRouter from "./health.js";

export function registerRoutes(app: Express) {
    // Бүх admin-тай холбоотой замууд /api/admin гэж эхэлнэ
    app.use("/api/admin", adminRouter);

    // Бусад замууд
    app.use("/api/parking", parkingRouter);
    app.use("/api/health", healthRouter);

    console.log("✅ Admin, Parking, Health замууд бүртгэгдлээ.");
}