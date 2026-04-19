// routes/eventRoutes.js

const express = require("express");
const router = express.Router();

const {
  createEvent,
  getAllEvents,
  getSingleEvent,
  updateEvent,
  deleteEvent,
  getMyEvents,
} = require("../controllers/eventController");

const { protect, authorize } = require("../middleware/authMiddleware");

// ── Public ────────────────────────────────────────────────
router.get("/", getAllEvents);

// ── Organizer only ───────────

router.post("/", protect, authorize("organizer"), createEvent);
router.get("/my-events/list", protect, authorize("organizer"), getMyEvents);

// ── Dynamic segment routes ─────────────────
router.get("/:id", getSingleEvent);
router.patch("/:id", protect, authorize("organizer"), updateEvent);
router.delete("/:id", protect, authorize("organizer"), deleteEvent);

module.exports = router;