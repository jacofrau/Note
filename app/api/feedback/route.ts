import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const feedbackRecipient = process.env.FEEDBACK_EMAIL_TO?.trim() || "jacopo.frau04@gmail.com";
const openAiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const openAiModerationModel = process.env.OPENAI_FEEDBACK_MODERATION_MODEL?.trim() || "omni-moderation-latest";

type FeedbackPayload = {
  designMode: string;
  message: string;
  userName: string;
  version: string;
};

type FeedbackReviewDecision = {
  allow: boolean;
  reason: string;
  source: "heuristic" | "openai-moderation" | "none";
};

type OpenAIModerationResponse = {
  results?: Array<{
    flagged?: boolean;
  }>;
};

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizePayload(value: unknown): FeedbackPayload {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    designMode: normalizeString(candidate.designMode, 32),
    message: normalizeString(candidate.message, 4000),
    userName: normalizeString(candidate.userName, 64),
    version: normalizeString(candidate.version, 32),
  };
}

function resolveTransportConfig() {
  const user = process.env.SMTP_USER?.trim() || "";
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "") || "";
  const host = process.env.SMTP_HOST?.trim() || (user.toLocaleLowerCase("en-US").endsWith("@gmail.com") ? "smtp.gmail.com" : "");
  const parsedPort = Number.parseInt(process.env.SMTP_PORT?.trim() || "", 10);
  const port = Number.isFinite(parsedPort) ? parsedPort : 465;
  const secure = typeof process.env.SMTP_SECURE === "string" ? process.env.SMTP_SECURE === "true" : port === 465;
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    auth: {
      user,
      pass,
    },
    from,
    host,
    port,
    secure,
  };
}

function formatDesignModeLabel(value: string): string {
  return value === "v103b" ? "Moderno" : "Classico";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function reviewFeedbackWithHeuristics(message: string): FeedbackReviewDecision {
  const normalized = message.trim();
  const compact = normalized.replace(/\s+/g, " ");
  const words = compact
    .toLocaleLowerCase("it-IT")
    .split(/[\s,.;:!?()[\]{}"']+/u)
    .map((token) => token.trim())
    .filter(Boolean);
  const uniqueWords = new Set(words);
  const urlMatches = normalized.match(/https?:\/\/|www\./gi) ?? [];
  const punctuationMatches = normalized.match(/[^\p{L}\p{N}\s]/gu) ?? [];
  const lettersOnly = normalized.match(/[\p{L}\p{N}]/gu) ?? [];

  if (urlMatches.length >= 2) {
    return { allow: false, reason: "link-heavy", source: "heuristic" };
  }

  if (/(.)\1{9,}/u.test(normalized)) {
    return { allow: false, reason: "repeated-characters", source: "heuristic" };
  }

  if (words.length >= 5 && uniqueWords.size <= 1) {
    return { allow: false, reason: "repeated-word-spam", source: "heuristic" };
  }

  if (normalized.length >= 16 && lettersOnly.length > 0 && punctuationMatches.length / normalized.length > 0.45) {
    return { allow: false, reason: "low-signal-punctuation", source: "heuristic" };
  }

  if (lettersOnly.length < 4) {
    return { allow: false, reason: "too-short-or-empty", source: "heuristic" };
  }

  return { allow: true, reason: "passed-heuristics", source: "none" };
}

async function reviewFeedbackWithOpenAI(message: string): Promise<FeedbackReviewDecision> {
  if (!openAiApiKey) {
    return { allow: true, reason: "openai-not-configured", source: "none" };
  }

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: message,
      model: openAiModerationModel,
    }),
  });

  if (!response.ok) {
    return { allow: true, reason: "openai-moderation-unavailable", source: "none" };
  }

  const payload = (await response.json().catch(() => null)) as OpenAIModerationResponse | null;
  const flagged = payload?.results?.[0]?.flagged === true;

  if (flagged) {
    return { allow: false, reason: "flagged-by-openai-moderation", source: "openai-moderation" };
  }

  return { allow: true, reason: "passed-openai-moderation", source: "openai-moderation" };
}

async function reviewFeedback(message: string): Promise<FeedbackReviewDecision> {
  const heuristicDecision = reviewFeedbackWithHeuristics(message);
  if (!heuristicDecision.allow) {
    return heuristicDecision;
  }

  return reviewFeedbackWithOpenAI(message);
}

export async function POST(request: Request) {
  const config = resolveTransportConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "Invio feedback non configurato sul server. Imposta SMTP_USER e SMTP_PASS per abilitarlo.",
        ok: false,
      },
      {
        headers: noStoreHeaders,
        status: 503,
      },
    );
  }

  const body = await request.json().catch(() => null);
  const payload = normalizePayload(body);

  if (!payload.message) {
    return NextResponse.json(
      {
        error: "Scrivi un suggerimento prima di inviare.",
        ok: false,
      },
      {
        headers: noStoreHeaders,
        status: 400,
      },
    );
  }

  const reviewDecision = await reviewFeedback(payload.message);
  if (!reviewDecision.allow) {
    console.info("[feedback] filtered", {
      reason: reviewDecision.reason,
      source: reviewDecision.source,
    });

    return NextResponse.json(
      {
        ok: true,
        received: true,
      },
      {
        headers: noStoreHeaders,
      },
    );
  }

  const sentAt = new Date();
  const text = [
    payload.message,
    "",
    "---",
    `App: Note`,
    `Versione: ${payload.version || "non disponibile"}`,
    `Design: ${formatDesignModeLabel(payload.designMode)}`,
    `Nome app: ${payload.userName || "non impostato"}`,
    `Inviato il: ${sentAt.toISOString()}`,
  ].join("\n");
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#111;line-height:1.6">
      <h2 style="margin:0 0 12px">Note - Suggerimento/Feedback</h2>
      <p style="white-space:pre-wrap;margin:0 0 16px">${escapeHtml(payload.message)}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0" />
      <p style="margin:4px 0"><strong>App:</strong> Note</p>
      <p style="margin:4px 0"><strong>Versione:</strong> ${escapeHtml(payload.version || "non disponibile")}</p>
      <p style="margin:4px 0"><strong>Design:</strong> ${escapeHtml(formatDesignModeLabel(payload.designMode))}</p>
      <p style="margin:4px 0"><strong>Nome app:</strong> ${escapeHtml(payload.userName || "non impostato")}</p>
      <p style="margin:4px 0"><strong>Inviato il:</strong> ${escapeHtml(sentAt.toISOString())}</p>
    </div>
  `;

  try {
    const transporter = nodemailer.createTransport({
      auth: config.auth,
      host: config.host,
      port: config.port,
      secure: config.secure,
    });

    await transporter.sendMail({
      from: config.from,
      subject: "Note - Suggerimento/Feedback",
      text,
      html,
      to: feedbackRecipient,
    });

    return NextResponse.json(
      {
        ok: true,
        received: true,
      },
      {
        headers: noStoreHeaders,
      },
    );
  } catch {
    return NextResponse.json(
      {
        error: "Invio feedback non riuscito. Controlla la configurazione email del server.",
        ok: false,
      },
      {
        headers: noStoreHeaders,
        status: 500,
      },
    );
  }
}
