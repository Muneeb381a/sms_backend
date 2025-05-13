import express from "express";
import { createNotification, getGroupNotifications } from "../controllers/notificationController.js";


const router = express.Router()

router.post("/", createNotification);
router.get("/", getGroupNotifications);




export default router;