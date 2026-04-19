// routes/bookingRoutes.js

const express = require("express");
const router = express.Router();

const {
  createBooking,
  getMyBookings,
  getSingleBooking,   
  cancelBooking,
  getBookingsByEvent,
} = require("../controllers/bookingController");

const { protect, authorize } = require("../middleware/authMiddleware");

// ── Customer routes ───────────────────────────────────────
router.post("/", protect, authorize("customer"), createBooking);
router.get("/my-bookings", protect, authorize("customer"), getMyBookings);

// ── Organizer routes  ─────────────
router.get("/event/:eventId", protect, authorize("organizer"), getBookingsByEvent);

// ── Dynamic segment routes  ─────────────────

router.get("/:id", protect, authorize("customer"), getSingleBooking);
router.patch("/:id/cancel", protect, authorize("customer"), cancelBooking);

module.exports = router;