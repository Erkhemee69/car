import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { parkingRecordsTable, tariffSettingsTable, parkingCapacityTable } from "@workspace/db";
import { eq, and, gte, lte, sql, count, avg, sum } from "drizzle-orm";

const router = Router();

router.get("/stats", (async (req: any, res: any) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };

    // 1. Нийт статистикийг SQL-ээр биш Drizzle-ийн select ашиглаад тус тусад нь авах (илүү аюулгүй)
    const statsResult = await db.select({
      totalRevenue: sql<number>`COALESCE(SUM(fee), 0)`,
      totalVehicles: sql<number>`COUNT(*)`,
      averageDuration: sql<number>`COALESCE(AVG(duration_minutes), 0)`
    }).from(parkingRecordsTable);

    // 2. Одоо идэвхтэй байгаа машинууд
    const activeCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(parkingRecordsTable)
      .where(eq(parkingRecordsTable.status, "active"));

    // 3. Сүүлийн 7 (эсвэл 30) хоногийн график
    // TO_CHAR ашиглах нь DATE_TRUNC-аас илүү хурдан бөгөөд алдаа багатай
    const dailyStats = await db.execute(sql`
      SELECT 
        TO_CHAR(entry_time, 'YYYY-MM-DD') as date,
        COALESCE(SUM(fee), 0)::float as revenue,
        COUNT(*)::int as vehicles
      FROM parking_records
      WHERE entry_time >= NOW() - INTERVAL '30 days'
      GROUP BY TO_CHAR(entry_time, 'YYYY-MM-DD')
      ORDER BY date ASC
    `);

    // 4. Хариуг илгээх
    res.json({
      totalRevenue: Number(statsResult[0]?.totalRevenue ?? 0),
      totalVehicles: Number(statsResult[0]?.totalVehicles ?? 0),
      activeVehicles: Number(activeCount[0]?.count ?? 0),
      averageDurationMinutes: Math.round(Number(statsResult[0]?.averageDuration ?? 0)),
      revenueByDay: (dailyStats.rows as any[]).map(r => ({
        date: String(r.date),
        revenue: Number(r.revenue),
        vehicles: Number(r.vehicles),
      })),
    });

  } catch (error) {
    console.error("Dashboard Stats Error Detail:", error); // Терминал дээр яг ямар алдаа гарч байгааг харах
    res.status(500).json({ error: "Статистик авахад алдаа гарлаа" });
  }
}) as any);

// 2. Тарифын тохиргоо авах
router.get("/tariff", (async (_req: any, res: any) => {
  try {
    const rows = await db.select().from(tariffSettingsTable).limit(1);
    let tariff = rows[0];

    if (!tariff) {
      // Хэрэв тохиргоо байхгүй бол анхны утга үүсгэх
      const [inserted] = await db
        .insert(tariffSettingsTable)
        .values({ ratePerHour: 2000, minimumFee: 500, freeMinutes: 10 })
        .returning();
      tariff = inserted;
    }
    res.json(tariff);
  } catch (error) {
    res.status(500).json({ error: "Тариф авахад алдаа гарлаа" });
  }
}) as any);

// 3. Тариф шинэчлэх
router.put("/tariff", (async (req: any, res: any) => {
  try {
    const { ratePerHour, minimumFee, freeMinutes } = req.body;
    const rows = await db.select().from(tariffSettingsTable).limit(1);

    if (rows.length === 0) {
      const [inserted] = await db
        .insert(tariffSettingsTable)
        .values({ ratePerHour, minimumFee, freeMinutes, updatedAt: new Date() })
        .returning();
      return res.json(inserted);
    }

    const [updated] = await db
      .update(tariffSettingsTable)
      .set({ ratePerHour, minimumFee, freeMinutes, updatedAt: new Date() })
      .where(eq(tariffSettingsTable.id, rows[0].id))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Тариф шинэчлэхэд алдаа гарлаа" });
  }
}) as any);

// 4. Багтаамж авах
router.get("/capacity", (async (_req: any, res: any) => {
  try {
    const rows = await db.select().from(parkingCapacityTable).limit(1);
    let cap = rows[0];

    if (!cap) {
      const [inserted] = await db.insert(parkingCapacityTable).values({ totalSpaces: 50 }).returning();
      cap = inserted;
    }
    res.json(cap);
  } catch (error) {
    res.status(500).json({ error: "Багтаамж авахад алдаа гарлаа" });
  }
}) as any);

// 5. Багтаамж шинэчлэх
router.put("/capacity", (async (req: any, res: any) => {
  try {
    const { totalSpaces } = req.body;
    const rows = await db.select().from(parkingCapacityTable).limit(1);

    if (rows.length === 0) {
      const [inserted] = await db.insert(parkingCapacityTable).values({ totalSpaces, updatedAt: new Date() }).returning();
      return res.json(inserted);
    }

    const [updated] = await db
      .update(parkingCapacityTable)
      .set({ totalSpaces, updatedAt: new Date() })
      .where(eq(parkingCapacityTable.id, rows[0].id))
      .returning();

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Багтаамж шинэчлэхэд алдаа гарлаа" });
  }
}) as any);

export default router;