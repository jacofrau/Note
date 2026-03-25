import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function getEnvValue(name: string): string {
  return process.env[name]?.trim() || "";
}

function normalizePlatform(value: string): "MAC" | "WIN" | "" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "darwin" || normalized === "mac" || normalized === "macos" || normalized === "osx") {
    return "MAC";
  }

  if (normalized === "win" || normalized === "windows" || normalized === "win32") {
    return "WIN";
  }

  return "";
}

function detectRequestedPlatform(request: NextRequest): "MAC" | "WIN" | "" {
  const queryPlatform = normalizePlatform(request.nextUrl.searchParams.get("platform") || "");
  if (queryPlatform) return queryPlatform;

  const userAgent = request.headers.get("user-agent") || "";
  if (/macintosh|mac os x/i.test(userAgent)) return "MAC";
  if (/windows/i.test(userAgent)) return "WIN";

  return "";
}

function getPlatformScopedEnv(name: string, platform: "MAC" | "WIN" | ""): string {
  if (platform) {
    const scopedValue = getEnvValue(`${name}_${platform}`);
    if (scopedValue) return scopedValue;
  }

  return getEnvValue(name);
}

function getReleasePayload(platform: "MAC" | "WIN" | "") {
  const version = getPlatformScopedEnv("APP_RELEASE_VERSION", platform);
  const downloadUrl = getPlatformScopedEnv("APP_RELEASE_DOWNLOAD_URL", platform);

  return {
    available: Boolean(version && downloadUrl),
    downloadUrl,
    version,
  };
}

export async function GET(request: NextRequest) {
  return NextResponse.json(getReleasePayload(detectRequestedPlatform(request)), {
    headers: corsHeaders,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: corsHeaders,
    status: 204,
  });
}
