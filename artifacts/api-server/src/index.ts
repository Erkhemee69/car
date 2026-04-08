import 'dotenv/config';
import express, { Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// routes хавтас доторх index.ts-ийг дуудаж байна
import { registerRoutes } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();

// 1. Хамгийн чухал: CORS тохиргоо (Dashboard дата авахад хэрэгтэй)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// 2. Системийн шалгалт
console.log('--- BACKEND STARTING ---');
if (process.env.DATABASE_URL) {
  console.log('✅ DATABASE_URL холбогдоход бэлэн.');
} else {
  console.error('❌ АЛДАА: DATABASE_URL олдсонгүй! .env файлыг шалга.');
}

// 3. Routes бүртгэх
try {
  registerRoutes(app);
  console.log('✅ Бүх API замууд (Admin, Parking, Health) амжилттай ачааллаа.');
} catch (error) {
  console.error('❌ registerRoutes-ийг ачаалахад алдаа гарлаа:', error);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер http://localhost:${PORT} дээр ажиллаж байна`);
});