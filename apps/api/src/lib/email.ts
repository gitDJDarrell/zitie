// Outbound email via Resend's HTTP API — no SDK needed. Without a
// RESEND_API_KEY the mail is skipped entirely; in non-production the reset
// link is also printed to the API console so the flow is testable locally
// without email delivery.

const FROM = process.env.EMAIL_FROM ?? "Zitie <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[email] password reset for ${to}: ${resetUrl}`);
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: "字帖 Zitie — reset your password",
      text: [
        "Someone (hopefully you) asked to reset the password for this Zitie account.",
        "",
        `Reset it here (link valid for 30 minutes): ${resetUrl}`,
        "",
        "If this wasn't you, ignore this email — nothing changes without the link.",
      ].join("\n"),
    }),
  });
  if (!res.ok) {
    // Deliverability problems are an ops concern, never a signal to the caller
    // (the forgot endpoint must stay enumeration-safe).
    console.error(`[email] Resend send failed (${res.status}): ${await res.text()}`);
  }
}
