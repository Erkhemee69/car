import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { parkingRecordsTable, tariffSettingsTable, parkingCapacityTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, count, avg } from "drizzle-orm";
import QRCode from "qrcode";

const router: IRouter = Router();

function calculateFee(
  entryTime: Date,
  exitTime: Date,
  ratePerHour: number,
  minimumFee: number,
  freeMinutes: number
): { fee: number; durationMinutes: number } {
  const durationMs = exitTime.getTime() - entryTime.getTime();
  const durationMinutes = Math.ceil(durationMs / 60000);

  if (durationMinutes <= freeMinutes) {
    return { fee: 0, durationMinutes };
  }

  const billableMinutes = durationMinutes - freeMinutes;
  const fee = Math.max(minimumFee, (billableMinutes / 60) * ratePerHour);
  return { fee: Math.ceil(fee), durationMinutes };
}

router.post("/enter", (async (req: any, res: any) => {
  const { plateNumber } = req.body as { plateNumber?: string };

  if (!plateNumber || !plateNumber.trim()) {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Тээврийн хэрэгслийн дугаар шаардлагатай" });
  }

  const plate = plateNumber.trim().toUpperCase();

  const existing = await db
    .select()
    .from(parkingRecordsTable)
    .where(and(eq(parkingRecordsTable.plateNumber, plate), eq(parkingRecordsTable.status, "active")))
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({ error: "CONFLICT", message: "Энэ тээврийн хэрэгсэл аль хэдийн зогсоолд байна" });
  }

  const capacityRows = await db.select().from(parkingCapacityTable).limit(1);
  const totalSpaces = capacityRows[0]?.totalSpaces ?? 50;

  const activeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.status, "active"));

  if ((activeCount[0]?.count ?? 0) >= totalSpaces) {
    return res.status(400).json({ error: "FULL", message: "Зогсоол дүүрэн байна" });
  }

  const [record] = await db
    .insert(parkingRecordsTable)
    .values({ plateNumber: plate, entryTime: new Date(), status: "active" })
    .returning();

  res.json(record);
}) as any);

router.get("/records", (async (req: any, res: any) => {
  const { status, limit = "50", offset = "0" } = req.query as {
    status?: string;
    limit?: string;
    offset?: string;
  };

  let query = db.select().from(parkingRecordsTable).$dynamic();

  if (status && status !== "all") {
    if (status === "active") {
      query = query.where(eq(parkingRecordsTable.status, "active"));
    } else if (status === "completed") {
      query = query.where(eq(parkingRecordsTable.status, "completed"));
    }
  }

  const records = await query
    .orderBy(desc(parkingRecordsTable.entryTime))
    .limit(Number(limit))
    .offset(Number(offset));

  const totalRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(parkingRecordsTable);

  res.json({ records, total: totalRes[0]?.count ?? 0 });
}) as any);

router.get("/records/:id", (async (req: any, res: any) => {
  const id = Number(req.params.id);
  const [record] = await db
    .select()
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.id, id))
    .limit(1);

  if (!record) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Бүртгэл олдсонгүй" });
  }

  res.json(record);
}) as any);

router.post("/exit/:id", (async (req: any, res: any) => {
  const id = Number(req.params.id);

  const [record] = await db
    .select()
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.id, id))
    .limit(1);

  if (!record) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Бүртгэл олдсонгүй" });
  }

  if (record.status !== "active") {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Энэ бүртгэл идэвхтэй байхгүй байна" });
  }

  const tariffRows = await db.select().from(tariffSettingsTable).limit(1);
  const tariff = tariffRows[0] ?? { ratePerHour: 2000, minimumFee: 500, freeMinutes: 10 };

  const exitTime = new Date();
  const { fee, durationMinutes } = calculateFee(
    record.entryTime,
    exitTime,
    tariff.ratePerHour,
    tariff.minimumFee,
    tariff.freeMinutes
  );

  const [updated] = await db
    .update(parkingRecordsTable)
    .set({ exitTime, fee, durationMinutes, status: "pending_payment" })
    .where(eq(parkingRecordsTable.id, id))
    .returning();

  const paymentData = JSON.stringify({ recordId: id, plateNumber: record.plateNumber, fee, action: "pay_parking" });
  const qrCode = await QRCode.toDataURL(paymentData);

  res.json({ record: updated, fee, durationMinutes, qrCode });
}) as any);

router.get("/qr/:id", (async (req: any, res: any) => {
  const id = Number(req.params.id);

  const [record] = await db
    .select()
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.id, id))
    .limit(1);

  if (!record) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Бүртгэл олдсонгүй" });
  }

  const paymentData = JSON.stringify({ recordId: id, plateNumber: record.plateNumber, fee: record.fee, action: "pay_parking" });
  const qrCode = await QRCode.toDataURL(paymentData);

  res.json({ qrCode, fee: record.fee ?? 0, recordId: id });
}) as any);

router.post("/pay/:id", (async (req: any, res: any) => {
  const id = Number(req.params.id);

  const [record] = await db
    .select()
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.id, id))
    .limit(1);

  if (!record) {
    return res.status(404).json({ error: "NOT_FOUND", message: "Бүртгэл олдсонгүй" });
  }

  if (record.status === "completed" || record.status === "paid") {
    return res.status(400).json({ error: "ALREADY_PAID", message: "Энэ бүртгэлийн төлбөр аль хэдийн төлөгдсөн" });
  }

  if (record.status === "active") {
    return res.status(400).json({ error: "BAD_REQUEST", message: "Эхлээд машиныг гаргах процессыг эхлүүлнэ үү" });
  }

  const [updated] = await db
    .update(parkingRecordsTable)
    .set({ status: "completed" })
    .where(eq(parkingRecordsTable.id, id))
    .returning();

  res.json({
    success: true,
    record: updated,
    gateOpened: true,
    message: "Төлбөр амжилттай төлөгдлөө. Хаалт нээгдэж байна...",
  });
}) as any);

router.get("/status", (async (req: any, res: any) => {
  const capacityRows = await db.select().from(parkingCapacityTable).limit(1);
  const totalSpaces = capacityRows[0]?.totalSpaces ?? 50;

  const activeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(parkingRecordsTable)
    .where(eq(parkingRecordsTable.status, "active"));

  const occupiedSpaces = Number(activeCount[0]?.count ?? 0);
  const availableSpaces = Math.max(0, totalSpaces - occupiedSpaces);
  const occupancyRate = totalSpaces > 0 ? (occupiedSpaces / totalSpaces) * 100 : 0;

  res.json({ totalSpaces, occupiedSpaces, availableSpaces, occupancyRate });
}) as any);

export default router;
