// controllers/bookingController.js

const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");

const {
  sendBookingConfirmation,
} = require("../utils/asyncJobs");

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

/**
 * Maximum number of tickets a customer can book
 * in a single booking request.
 * Prevents a single user from reserving all seats.
 */
const MAX_TICKETS_PER_BOOKING = 10;

/**
 * Minimum hours before an event starts
 * within which cancellations are NOT allowed.
 */
const CANCELLATION_CUTOFF_HOURS = 24;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Generates a unique booking code.
 * Format: BK<timestamp><random 3-digit suffix>
 *
 * @returns {string} e.g. "BK17190000000042"
 */
const generateBookingCode = () => {
  return (
    "BK" +
    Date.now() +
    Math.floor(Math.random() * 1000)
  );
};

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * CREATE BOOKING
 * POST /api/bookings
 * Access: Customer
 *
 * Body:
 * {
 *   eventId   : string  — ID of the event to book
 *   quantity  : number  — Number of tickets (1 – MAX_TICKETS_PER_BOOKING)
 * }
 *
 * Flow:
 *  1. Validate inputs.
 *  2. Open a MongoDB transaction.
 *  3. Atomically decrement available seats (prevents race conditions).
 *  4. Create the booking document inside the same transaction.
 *  5. Commit and trigger a background confirmation email.
 *
 * Fix #1 — Atomic seat reservation via findOneAndUpdate with $expr guard,
 *           replacing the old read-check-modify-save pattern that was
 *           vulnerable to race conditions under concurrent requests.
 *
 * Fix #12 — Per-booking ticket cap to prevent a single user from
 *            reserving all seats.
 */
exports.createBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { eventId, quantity } = req.body;

    // ── Input validation ──────────────────────
    if (!eventId || !quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "eventId and a valid quantity (≥ 1) are required.",
      });
    }

    const parsedQty = Number(quantity);

    // Fix #12: Enforce per-booking ticket cap.
    if (parsedQty > MAX_TICKETS_PER_BOOKING) {
      return res.status(400).json({
        success: false,
        message: `Cannot book more than ${MAX_TICKETS_PER_BOOKING} tickets in a single booking.`,
      });
    }

    // ── Transaction ───────────────────────────
    session.startTransaction();

    /**
     * Fix #1: Atomic seat reservation.
     *
     * findOneAndUpdate with a compound filter:
     *   • event must exist and be "published"
     *   • event date must be in the future
     *   • (totalSeats - bookedSeats) must be >= requested quantity
     *
     * $inc is only applied when ALL conditions pass, making this
     * an atomic check-and-update with no race condition window.
     *
     * If the update returns null, at least one condition failed —
     * we query the event separately to return a precise error message.
     */
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        status: "published",
        eventDate: { $gte: new Date() },
        $expr: {
          $gte: [
            { $subtract: ["$totalSeats", "$bookedSeats"] },
            parsedQty,
          ],
        },
      },
      {
        $inc: { bookedSeats: parsedQty },
      },
      {
        new: true,   // return the updated document
        session,     // participate in the current transaction
      }
    );

    // If atomic update did not match, find out why to return
    // a helpful error message instead of a generic failure.
    if (!updatedEvent) {
      const event = await Event.findById(eventId).session(session);

      await session.abortTransaction();
      session.endSession();

      if (!event) {
        return res.status(404).json({
          success: false,
          message: "Event not found.",
        });
      }

      if (event.status !== "published") {
        return res.status(400).json({
          success: false,
          message: "Event is not available for booking.",
        });
      }

      if (new Date(event.eventDate) < new Date()) {
        return res.status(400).json({
          success: false,
          message: "This event has already taken place.",
        });
      }

      // All other conditions passed → seats were insufficient.
      return res.status(400).json({
        success: false,
        message: `Only ${event.totalSeats - event.bookedSeats} seat(s) available.`,
      });
    }

    // Recalculate and persist availableSeats on the returned document.
    updatedEvent.availableSeats =
      updatedEvent.totalSeats - updatedEvent.bookedSeats;
    await updatedEvent.save({ session });

    const totalAmount = parsedQty * Number(updatedEvent.price);

    // ── Create booking document ───────────────
    const booking = await Booking.create(
      [
        {
          eventId: updatedEvent._id,
          customerId: req.user._id,
          quantity: parsedQty,
          pricePerTicket: updatedEvent.price,
          totalAmount,
          bookingStatus: "confirmed",
          paymentStatus: "paid",
          bookingCode: generateBookingCode(),
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // ── Background Task 1 ─────────────────────
    // Trigger confirmation email asynchronously AFTER the transaction
    // has committed so the booking record is guaranteed to exist.
    sendBookingConfirmation({
      bookingId: booking[0]._id,
      customerEmail: req.user.email,
      customerName: req.user.fullName,
      eventTitle: updatedEvent.title,
    });

    return res.status(201).json({
      success: true,
      message: "Booking successful.",
      booking: booking[0],
    });
  } catch (error) {
    // Always abort an in-progress transaction on unexpected errors.
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────

/**
 * GET MY BOOKINGS
 * GET /api/bookings/my-bookings
 * Access: Customer
 *
 * Returns all bookings for the currently authenticated customer,
 * newest first, with event details populated.
 */
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      customerId: req.user._id,
    })
      .populate("eventId", "title venue eventDate price status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────

/**
 * GET SINGLE BOOKING
 * GET /api/bookings/:id
 * Access: Customer (own booking only)
 *
 * Returns a single booking if it belongs to the requesting customer.
 */
exports.getSingleBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(
      "eventId",
      "title venue eventDate price"
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Ownership check — customers may only view their own bookings.
    if (booking.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    return res.status(200).json({
      success: true,
      booking,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────

/**
 * CANCEL BOOKING
 * PATCH /api/bookings/:id/cancel
 * Access: Customer (own booking only)
 *
 * Flow:
 *  1. Verify booking exists and belongs to requesting customer.
 *  2. Ensure booking has not already been cancelled.
 *  3. Enforce cancellation cutoff window (no cancellations within
 *     CANCELLATION_CUTOFF_HOURS hours of the event).
 *  4. Release seats back to the event (only if event is still
 *     active and has not yet taken place).
 *  5. Mark booking as cancelled; set paymentStatus to "refunded"
 *     only when payment was actually collected.
 *
 * Fix #4  — Cancellation cutoff: blocks last-minute cancellations.
 * Fix #5  — Seat release guard: seats are only released when the
 *            event still exists, is published, and is upcoming.
 * Fix #6  — Conditional refund: paymentStatus is set to "refunded"
 *            only when it was previously "paid".
 */
exports.cancelBooking = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    // ── Fetch and validate booking ────────────
    const booking = await Booking.findById(req.params.id).session(
      session
    );

    if (!booking) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    // Ownership check.
    if (booking.customerId.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      session.endSession();

      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    // Idempotency check — prevent double-cancellation.
    if (booking.bookingStatus === "cancelled") {
      await session.abortTransaction();
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "This booking has already been cancelled.",
      });
    }

    // ── Fetch linked event ────────────────────
    const event = await Event.findById(booking.eventId).session(session);

    // Fix #4: Enforce cancellation cutoff window.
    // If the event still exists and is upcoming, check the time gate.
    if (event && new Date(event.eventDate) > new Date()) {
      const hoursUntilEvent =
        (new Date(event.eventDate) - new Date()) / (1000 * 60 * 60);

      if (hoursUntilEvent < CANCELLATION_CUTOFF_HOURS) {
        await session.abortTransaction();
        session.endSession();

        return res.status(400).json({
          success: false,
          message: `Cancellations are not allowed within ${CANCELLATION_CUTOFF_HOURS} hours of the event.`,
        });
      }
    }

    // Fix #5: Only release seats when the event is active and upcoming.
    // Releasing seats on a completed or cancelled event is meaningless
    // and could corrupt the bookedSeats counter.
    if (
      event &&
      event.status === "published" &&
      new Date(event.eventDate) > new Date()
    ) {
      event.bookedSeats = Math.max(
        0,
        event.bookedSeats - booking.quantity
      );
      event.availableSeats = event.totalSeats - event.bookedSeats;

      await event.save({ session });
    }

    // ── Update booking status ─────────────────
    booking.bookingStatus = "cancelled";

    // Fix #6: Only mark as "refunded" when payment was actually taken.
    // A booking with paymentStatus "pending" or "failed" should not
    // be marked "refunded" as no money was ever collected.
    if (booking.paymentStatus === "paid") {
      booking.paymentStatus = "refunded";
    }

    await booking.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Booking cancelled successfully.",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────

/**
 * GET BOOKINGS BY EVENT
 * GET /api/bookings/event/:eventId
 * Access: Organizer (event owner only)
 *
 * Returns paginated bookings for a specific event.
 * The requesting user must be the organizer who owns the event.
 *
 * Query params:
 *   page  (default 1)
 *   limit (default 20)
 *
 * Fix #11 — Added pagination to prevent unbounded result sets
 *            on high-demand events.
 */
exports.getBookingsByEvent = async (req, res) => {
  try {
    // ── Pagination params ─────────────────────
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    // ── Event lookup & ownership check ────────
    const event = await Event.findById(req.params.eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.organizerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    // ── Paginated bookings query ──────────────
    const [bookings, total] = await Promise.all([
      Booking.find({ eventId: req.params.eventId })
        .populate("customerId", "fullName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Booking.countDocuments({ eventId: req.params.eventId }),
    ]);

    return res.status(200).json({
      success: true,
      page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};