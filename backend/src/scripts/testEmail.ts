import { notifyFailure } from "../services/notifications.js";

/**
 * Standalone test for the email/notification pipeline.
 * Run with: npx tsx src/scripts/testEmail.ts
 *
 * Requires SMTP_* and ALERT_EMAIL_TO set in .env.
 */
async function main(): Promise<void> {
  console.log("Sending test failure notification…\n");

  await notifyFailure({
    callId: "test-call-12345",
    fileName: "sample-refund-call.mp3",
    reason: "This is a TEST alert — transcription stage threw a simulated error.",
    timestamp: new Date().toISOString(),
    attemptsMade: 3,
    stage: "transcription",
  });

  console.log("\nDone. Check your inbox (and spam folder).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
