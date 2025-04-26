import { app } from "./app.js";
import dotenv from "dotenv"
import { initializeDatabase } from "./config/db.js";
import logger from "./services/logger.js";

dotenv.config();


const PORT = process.env.PORT || 3000;
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.stack}`);
    process.exit(1);
  }
}

startServer();