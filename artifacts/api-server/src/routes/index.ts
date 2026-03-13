import { Router, type IRouter } from "express";
import healthRouter from "./health";
import parkingRouter from "./parking";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/parking", parkingRouter);
router.use("/admin", adminRouter);

export default router;
