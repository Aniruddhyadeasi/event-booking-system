// utils/asyncJobs.js

/**
 * Lightweight async background jobs
 * No Redis / No BullMQ required
 */

exports.sendBookingConfirmation = (data) => {
  setImmediate(() => {
    console.log("📧 BOOKING CONFIRMATION EMAIL");
    console.log(`To: ${data.customerEmail}`);
    console.log(`Name: ${data.customerName}`);
    console.log(`Event: ${data.eventTitle}`);
    console.log(`Booking ID: ${data.bookingId}`);
    console.log("------------------------------------------------");
  });
};

exports.sendEventUpdateNotification = (data) => {
  setImmediate(() => {
    console.log("📢 EVENT UPDATE NOTIFICATION");
    console.log(`Event: ${data.eventTitle}`);
    console.log(`User Email: ${data.customerEmail}`);
    console.log("------------------------------------------------");
  });
};