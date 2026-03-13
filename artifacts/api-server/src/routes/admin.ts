import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { parkingRecordsTable, tariffSettingsTable, parkingCapacityTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, count, avg, sum } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  let whereClause;
  if (from && to) {
    whereClause = and(
      gte(parkingRecordsTable.entryTime, new Date(from)),
      lte(parkingRecordsTable.entryTime, new Date(to))
    );
  }

  const statsQuery = db
    .select({
      totalRevenue: sum(parkingRecordsTable.fee),
      totalVehicles: count(),
      averageDuration: avg(parkingRecordsTable.durationMinutes),
    })
    .from(parkingRecordsTable);

  const stats = whereClause
    ? await statsQuery.where(whereClause)
    : await statsQuery;

  const activeCount = await db
    .select({ count: count() })
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.status, "active"));

  const revenueByDayQuery = await db.execute(sql`
    SELECT 
      DATE(entry_time AT TIME ZONE 'Asia/Ulaanbaatar') as date,
      COALESCE(SUM(fee), 0)::float as revenue,
      COUNT(*)::int as vehicles
    FROM parking_records
    WHERE entry_time >= NOW() - INTERVAL '30 days'
    ${whereClause ? sql`AND entry_time >= ${from ? new Date(from) : new Date()} AND entry_time <= ${to ? new Date(to) : new Date()}` : sql``}
    GROUP BY DATE(entry_time AT TIME ZONE 'Asia/Ulaanbaatar')
    ORDER BY date DESC
    LIMIT 30
  `);

  res.json({
    totalRevenue: Number(stats[0]?.totalRevenue ?? 0),
    totalVehicles: Number(stats[0]?.totalVehicles ?? 0),
    activeVehicles: Number(activeCount[0]?.count ?? 0),
    averageDurationMinutes: Number(stats[0]?.averageDuration ?? 0),
    revenueByDay: (revenueByDayQuery.rows as { date: string; revenue: number; vehicles: number }[]).map(r => ({
      date: String(r.date),
      revenue: Number(r.revenue),
      vehicles: Number(r.vehicles),
    })),
  });
});

router.get("/tariff", async (req, res) => {
  const rows = await db.select().from(tariffSettingsTable).limit(1);
  const tariff = rows[0];
  if (!tariff) {
    const [inserted] = await db
      .insert(tariffSettingsTable)
      .values({ ratePerHour: 2000, minimumFee: 500, freeMinutes: 10 })
      .returning();
    return res.json({ ratePerHour: inserted.ratePerHour, minimumFee: inserted.minimumFee, freeMinutes: inserted.freeMinutes });
  }
  res.json({ ratePerHour: tariff.ratePerHour, minimumFee: tariff.minimumFee, freeMinutes: tariff.freeMinutes });
});

router.put("/tariff", async (req, res) => {
  const { ratePerHour, minimumFee, freeMinutes } = req.body as {
    ratePerHour: number;
    minimumFee: number;
    freeMinutes: number;
  };

  const rows = await db.select().from(tariffSettingsTable).limit(1);

  if (rows.length === 0) {
    const [inserted] = await db
      .insert(tariffSettingsTable)
      .values({ ratePerHour, minimumFee, freeMinutes, updatedAt: new Date() })
      .returning();
    return res.json({ ratePerHour: inserted.ratePerHour, minimumFee: inserted.minimumFee, freeMinutes: inserted.freeMinutes });
  }

  const [updated] = await db
    .update(tariffSettingsTable)
    .set({ ratePerHour, minimumFee, freeMinutes, updatedAt: new Date() })
    .where(eq(tariffSettingsTable.id, rows[0].id))
    .returning();

  res.json({ ratePerHour: updated.ratePerHour, minimumFee: updated.minimumFee, freeMinutes: updated.freeMinutes });
});

router.get("/capacity", async (req, res) => {
  const rows = await db.select().from(parkingCapacityTable).limit(1);
  const cap = rows[0];
  if (!cap) {
    const [inserted] = await db.insert(parkingCapacityTable).values({ totalSpaces: 50 }).returning();
    return res.json({ totalSpaces: inserted.totalSpaces });
  }
  res.json({ totalSpaces: cap.totalSpaces });
});

router.put("/capacity", async (req, res) => {
  const { totalSpaces } = req.body as { totalSpaces: number };

  const rows = await db.select().from(parkingCapacityTable).limit(1);
  if (rows.length === 0) {
    const [inserted] = await db.insert(parkingCapacityTable).values({ totalSpaces, updatedAt: new Date() }).returning();
    return res.json({ totalSpaces: inserted.totalSpaces });
  }

  const [updated] = await db
    .update(parkingCapacityTable)
    .set({ totalSpaces, updatedAt: new Date() })
    .where(eq(parkingCapacityTable.id, rows[0].id))
    .returning();

  res.json({ totalSpaces: updated.totalSpaces });
});

export default router;
