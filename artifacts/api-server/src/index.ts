import dotenv from 'dotenv';
import path from 'path';
import express, { Express } from 'express';
import cors from 'cors';

// 1. .env файлыг backend хавтасны үндсэн хэсгээс унших
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { registerRoutes } from './routes';

const app: Express = express();

// 2. Датабааз холболтын шалгалт (Терминал дээр харагдана)
console.log('--- SYSTEM CHECK ---');
if (process.env.DATABASE_URL) {
  console.log('✅ DATABASE_URL олдлоо. Neon-той холбогдоход бэлэн.');
} else {
  console.error('❌ АЛДАА: DATABASE_URL олдсонгүй! .env файлыг шалга.');
}

app.use(express.json());

// 3. CORS тохиргоо - Vercel болон Local-ыг хоёуланг нь зөвшөөрөх
app.use(cors({
  origin: '*',
  credentials: true
}));

// 4. Route-үүдийг бүртгэх
registerRoutes(app);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});