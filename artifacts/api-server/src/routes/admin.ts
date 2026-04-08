import { Router } from "express";
import { db } from "@workspace/db";
import { parkingRecordsTable, tariffSettingsTable, parkingCapacityTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const router = Router();

router.get("/stats", (async (req: any, res: any) => {
  try {
    // 1. Үндсэн статистик (Нийт орлого, машин, дундаж хугацаа)
    const statsResult = await db.execute(sql`
      SELECT 
        COALESCE(SUM(fee), 0)::float as "totalRevenue",
        COUNT(*)::int as "totalVehicles",
        COALESCE(AVG(duration_minutes), 0)::float as "averageDuration"
      FROM parking_records
    `);
    const stats = statsResult.rows[0] as any;

    // 2. Идэвхтэй байгаа машинууд
    const activeCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(parkingRecordsTable)
      .where(eq(parkingRecordsTable.status, "active"));

    // 3. Сүүлийн 7 хоногийн график (Энэ хэсэг маш чухал)
    const dailyStats = await db.execute(sql`
      SELECT 
        TO_CHAR(entry_time, 'YYYY-MM-DD') as date,
        COALESCE(SUM(fee), 0)::float as revenue,
        COUNT(*)::int as vehicles
      FROM parking_records
      WHERE entry_time >= NOW() - INTERVAL '7 days'
      GROUP BY TO_CHAR(entry_time, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    res.json({
      totalRevenue: Number(stats?.totalRevenue ?? 0),
      totalVehicles: Number(stats?.totalVehicles ?? 0),
      activeVehicles: Number(activeCount[0]?.count ?? 0),
      averageDurationMinutes: Math.round(Number(stats?.averageDuration ?? 0)),
      revenueByDay: dailyStats.rows.map((r: any) => ({
        date: r.date,
        revenue: Number(r.revenue),
        vehicles: Number(r.vehicles),
      })),
    });

  } catch (error) {
    console.error("Dashboard Stats Error:", error);
    res.status(500).json({ error: "Статистик авахад алдаа гарлаа" });
  }
}) as any);

// Тариф болон бусад замууд чинь зөв байгаа тул хэвээр үлдээж болно
export default router;