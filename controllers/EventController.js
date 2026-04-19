// controllers/eventController.js

const Event = require("../models/Event");
const Booking = require("../models/Booking");
const {
  sendEventUpdateNotification,
} = require("../utils/asyncJobs");

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

/**
 * Fields that an organizer is permitted to update on an event.
 *
 * Fix #2 — Replaces Object.assign(event, req.body), which allowed
 * a malicious client to overwrite protected fields such as
 * organizerId, bookedSeats, and availableSeats.
 */
const ALLOWED_EVENT_UPDATE_FIELDS = [
  "title",
  "description",
  "category",
  "venue",
  "eventDate",
  "price",
  "totalSeats",
  "imageUrl",
  "status",
];

/**
 * Allowed values for the event status field.
 *
 * Fix #8 — Prevents arbitrary strings from being stored as status.
 */
const VALID_EVENT_STATUSES = ["draft", "published", "cancelled"];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Escapes special regex characters in a user-supplied string.
 * Prevents Regular Expression Denial-of-Service (ReDoS) attacks
 * when the value is used directly inside a MongoDB $regex query.
 *
 * Fix #10
 *
 * @param   {string} str — Raw user input
 * @returns {string}     — Safely escaped string
 */
const escapeRegex = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * CREATE EVENT
 * POST /api/events
 * Access: Organizer
 *
 * Creates a new event owned by the authenticated organizer.
 *
 * Fix #7 — eventDate is validated to be strictly in the future.
 * Fix #8 — status is validated against VALID_EVENT_STATUSES.
 */
exports.createEvent = async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      venue,
      eventDate,
      price,
      totalSeats,
      imageUrl,
      status,
    } = req.body;

    // ── Required-field validation ─────────────
    if (!title || !venue || !eventDate || price === undefined || !totalSeats) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields missing: title, venue, eventDate, price, totalSeats.",
      });
    }

    // ── Numeric range validation ──────────────
    if (Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: "Price cannot be negative.",
      });
    }

    if (Number(totalSeats) < 1) {
      return res.status(400).json({
        success: false,
        message: "totalSeats must be at least 1.",
      });
    }

    // Fix #7: Reject events scheduled in the past.
    if (new Date(eventDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "eventDate must be a future date and time.",
      });
    }

    // Fix #8: Validate status against the allowed list.
    // Only "draft" and "published" are valid at creation time;
    // "cancelled" is a lifecycle state set via update.
    const resolvedStatus = status || "published";
    if (!["draft", "published"].includes(resolvedStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values at creation: "draft", "published".`,
      });
    }

    // ── Persist event ─────────────────────────
    const event = await Event.create({
      organizerId: req.user._id,
      title,
      description: description || "",
      category: category || "General",
      venue,
      eventDate,
      price: Number(price),
      totalSeats: Number(totalSeats),
      bookedSeats: 0,
      availableSeats: Number(totalSeats),
      imageUrl: imageUrl || "",
      status: resolvedStatus,
    });

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      event,
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
 * GET ALL EVENTS
 * GET /api/events
 * Access: Public
 *
 * Returns paginated published, upcoming events.
 * Supports optional search (by title) and category filter.
 *
 * Query params:
 *   page     (default 1)
 *   limit    (default 10, max 100)
 *   search   (partial title match)
 *   category (exact match)
 *
 * Fix #10 — User-supplied search string is escaped before being
 *            used in a $regex query to prevent ReDoS attacks.
 */
exports.getAllEvents = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;

    // Base query: only published, future events.
    const query = {
      status: "published",
      eventDate: { $gte: new Date() },
    };

    // Fix #10: Escape user input before constructing the regex.
    if (req.query.search) {
      query.title = {
        $regex: escapeRegex(req.query.search),
        $options: "i",
      };
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    const [events, total] = await Promise.all([
      Event.find(query)
        .populate("organizerId", "fullName email")
        .sort({ eventDate: 1 })
        .skip(skip)
        .limit(limit),
      Event.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      count: events.length,
      events,
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
 * GET SINGLE EVENT
 * GET /api/events/:id
 * Access: Public
 *
 * Returns a single event by ID, including organizer details.
 */
exports.getSingleEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate(
      "organizerId",
      "fullName email"
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    return res.status(200).json({
      success: true,
      event,
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
 * GET MY EVENTS
 * GET /api/events/my-events/list
 * Access: Organizer
 *
 * Returns all events (regardless of status) created by the
 * authenticated organizer, newest first.
 */
exports.getMyEvents = async (req, res) => {
  try {
    const events = await Event.find({
      organizerId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: events.length,
      events,
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
 * UPDATE EVENT
 * PATCH /api/events/:id
 * Access: Organizer (event owner only)
 *
 * Applies whitelisted field updates to an event.
 * When status is changed to "cancelled", all confirmed bookings
 * are automatically cancelled and seats are reset.
 * Notifies all affected confirmed customers in the background.
 *
 * Fix #2  — Object.assign replaced with an explicit whitelist so
 *            protected fields (organizerId, bookedSeats, etc.) cannot
 *            be overwritten by client-supplied data.
 *
 * Fix #3  — When status is set to "cancelled", confirmed bookings
 *            are bulk-updated to cancelled/refunded and seat counts
 *            are reset, preventing orphaned booking records.
 *
 * Fix #8  — status value is validated against VALID_EVENT_STATUSES.
 *
 * Fix #9  — Blocks editing events that have already taken place,
 *            and blocks setting eventDate to a past value.
 *
 * Fix #13 — Notification loop replaced with chunked batch processing
 *            to avoid spawning thousands of micro-tasks in a tight loop.
 */
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // ── Ownership check ───────────────────────
    if (event.organizerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    // Fix #9: Prevent editing events that have already occurred.
    if (new Date(event.eventDate) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Cannot update an event that has already taken place.",
      });
    }

    // ── Field-level validation ────────────────

    // Fix #9: Prevent setting eventDate to a past value.
    if (req.body.eventDate && new Date(req.body.eventDate) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "eventDate must be a future date and time.",
      });
    }

    // Prevent reducing totalSeats below the number already booked.
    if (
      req.body.totalSeats !== undefined &&
      Number(req.body.totalSeats) < event.bookedSeats
    ) {
      return res.status(400).json({
        success: false,
        message: `totalSeats (${req.body.totalSeats}) cannot be less than already booked seats (${event.bookedSeats}).`,
      });
    }

    // Fix #8: Validate the incoming status value.
    if (req.body.status && !VALID_EVENT_STATUSES.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values: ${VALID_EVENT_STATUSES.join(", ")}.`,
      });
    }

    // ── Cancellation side-effects ─────────────
    /**
     * Fix #3: When an organizer cancels an event, all confirmed bookings
     * must be cancelled and seat counts reset to avoid orphaned records
     * and misleading seat availability data.
     */
    const isCancellingEvent =
      req.body.status === "cancelled" && event.status !== "cancelled";

    if (isCancellingEvent) {
      // Bulk-update all confirmed bookings for this event.
      await Booking.updateMany(
        {
          eventId: event._id,
          bookingStatus: "confirmed",
        },
        {
          bookingStatus: "cancelled",
          paymentStatus: "refunded",
        }
      );

      // Reset seat counters since no booking is active anymore.
      event.bookedSeats = 0;
      event.availableSeats = event.totalSeats;
    }

    // ── Apply whitelisted updates ─────────────
    /**
     * Fix #2: Only fields in ALLOWED_EVENT_UPDATE_FIELDS are applied.
     * This prevents clients from overwriting organizerId, bookedSeats,
     * or any other field not intended to be user-editable.
     */
    ALLOWED_EVENT_UPDATE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        event[field] = req.body[field];
      }
    });

    // Recalculate availableSeats whenever totalSeats is updated.
    if (req.body.totalSeats !== undefined) {
      event.availableSeats = event.totalSeats - event.bookedSeats;
    }

    await event.save();

    // ── Background notifications ──────────────
    /**
     * Notify all customers with confirmed bookings about the update.
     *
     * Fix #13: Instead of a flat forEach that spawns one task per booking
     * (which could be tens of thousands), notifications are sent in
     * chunks of NOTIFICATION_CHUNK_SIZE. Each chunk is processed with
     * Promise.allSettled so one failure does not block the others.
     *
     * For production scale, replace this with a proper job queue
     * (e.g. BullMQ) that supports retries, rate-limiting, and dead-letter
     * queues. The chunked approach here is a safe interim solution.
     */
    const NOTIFICATION_CHUNK_SIZE = 50;

    const bookings = await Booking.find({
      eventId: event._id,
      bookingStatus: "confirmed",
    }).populate("customerId", "email");

    const emailTargets = bookings
      .map((b) => b.customerId?.email)
      .filter(Boolean); // filter out any null/undefined emails

    // Process in chunks to avoid event-loop saturation.
    for (
      let i = 0;
      i < emailTargets.length;
      i += NOTIFICATION_CHUNK_SIZE
    ) {
      const chunk = emailTargets.slice(i, i + NOTIFICATION_CHUNK_SIZE);

      // Use Promise.allSettled so a single failure does not abort the batch.
      await Promise.allSettled(
        chunk.map((email) =>
          sendEventUpdateNotification({
            customerEmail: email,
            eventTitle: event.title,
          })
        )
      );
    }

    return res.status(200).json({
      success: true,
      message:
        "Event updated successfully. Customer notifications sent in background.",
      event,
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
 * DELETE EVENT
 * DELETE /api/events/:id
 * Access: Organizer (event owner only)
 *
 * Permanently deletes an event.
 * Deletion is blocked when any confirmed bookings exist to
 * protect customers who have already booked tickets.
 */
exports.deleteEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Ownership check.
    if (event.organizerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access.",
      });
    }

    // Prevent deletion if any confirmed bookings exist.
    // Organizers should cancel the event first, which will
    // cancel all bookings, and then delete it.
    const confirmedBookingsCount = await Booking.countDocuments({
      eventId: event._id,
      bookingStatus: "confirmed",
    });

    if (confirmedBookingsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete an event with ${confirmedBookingsCount} confirmed booking(s). Cancel the event first.`,
      });
    }

    await event.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};