import app from "./app";

// Render-ээс өгсөн PORT-ыг авна, байхгүй бол 5000. 
// "0.0.0.0" гэж зааж өгөх нь Render-т заавал хэрэгтэй байдаг.
const PORT = Number(process.env.PORT) || 5000;

const startServer = () => {
  try {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🔗 Database URL is ${process.env.DATABASE_URL ? "Set" : "Not Set"}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();