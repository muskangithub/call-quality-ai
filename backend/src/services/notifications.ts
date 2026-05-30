import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

/**
 * Failure notification service.
 *
 * Design goals (from the spec):
 * - When processing fails, the right person is notified immediately
 * - The alert carries enough context to act on: Call ID, reason, timestamp
 *
 * Channels: console (always on) + email (if SMTP is configured).
 * Console logging always happens as a guaranteed fallback so a failure is
 * NEVER silent — exactly what the spec asks for.
 */

export interface FailureContext {
  callId: string;
  fileName: string;
  reason: string;
  timestamp: string; // ISO
  attemptsMade?: number;
  stage?: string; // e.g. "transcription", "diarization"
}

// ─── Email transport (lazy) ─────────────────────────────────────────────────
let mailTransport: nodemailer.Transporter | null = null;

function getMailTransport(): nodemailer.Transporter | null {
  const host = process.env["SMTP_HOST"];
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];

  if (!host || !user || !pass) return null;

  if (!mailTransport) {
    mailTransport = nodemailer.createTransport({
      host,
      port: Number(process.env["SMTP_PORT"] ?? 587),
      secure: process.env["SMTP_SECURE"] === "true",
      auth: { user, pass },
    });
  }
  return mailTransport;
}

// ─── Channel: Console (always on) ────────────────────────────────────────────
function notifyConsole(ctx: FailureContext): void {
  console.error(
    `\n🚨 CALL PROCESSING FAILED\n` +
      `   Call ID:   ${ctx.callId}\n` +
      `   File:      ${ctx.fileName}\n` +
      `   Stage:     ${ctx.stage ?? "unknown"}\n` +
      `   Reason:    ${ctx.reason}\n` +
      `   Attempts:  ${ctx.attemptsMade ?? "?"}\n` +
      `   Time:      ${ctx.timestamp}\n`
  );
}

// ─── Channel: Email ──────────────────────────────────────────────────────────
async function notifyEmail(ctx: FailureContext): Promise<void> {
  const transport = getMailTransport();
  const to = process.env["ALERT_EMAIL_TO"];
  if (!transport || !to) return;

  const html = `
    <h2 style="color:#dc2626;">🚨 Call Processing Failed</h2>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Call ID</td><td><b>${ctx.callId}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">File</td><td>${ctx.fileName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Stage</td><td>${ctx.stage ?? "unknown"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Attempts</td><td>${ctx.attemptsMade ?? "?"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666;">Timestamp</td><td>${ctx.timestamp}</td></tr>
    </table>
    <p style="color:#666;margin-top:12px;">Reason:</p>
    <pre style="background:#f4f4f5;padding:12px;border-radius:6px;font-size:13px;">${ctx.reason}</pre>
  `;

  try {
    await transport.sendMail({
      from: process.env["SMTP_FROM"] ?? process.env["SMTP_USER"],
      to,
      subject: `🚨 Call ${ctx.callId} failed — ${ctx.stage ?? "processing"}`,
      html,
    });
    console.log(`[Notify] Email alert sent to ${to}`);
  } catch (err) {
    console.error("[Notify] Email send failed:", (err as Error).message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Notify on a processing failure.
 * Console always fires; email fires only if SMTP is configured.
 * Sends are best-effort and never throw.
 */
export async function notifyFailure(ctx: FailureContext): Promise<void> {
  notifyConsole(ctx);
  await notifyEmail(ctx);
}
