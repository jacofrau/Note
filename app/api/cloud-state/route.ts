import { NextResponse } from "next/server";
import { hasCloudPatchContent, normalizeCloudStatePatch } from "@/lib/cloud-shared";
import { getCloudAccessKeyFromRequest, isCloudSyncEnabledOnServer, loadCloudStateServer, saveCloudStateServer } from "@/lib/cloud-server";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
  Vary: "x-cloud-access-key, authorization",
};

function createAccessKeyRequiredResponse() {
  return NextResponse.json(
    {
      enabled: true,
      error: "Chiave cloud mancante. Configura una chiave di sync nell'app per usare il cloud.",
    },
    {
      headers: noStoreHeaders,
      status: 401,
    },
  );
}

export async function GET(request: Request) {
  if (!isCloudSyncEnabledOnServer()) {
    return NextResponse.json({ enabled: false }, { headers: noStoreHeaders });
  }

  const accessKey = getCloudAccessKeyFromRequest(request);
  if (!accessKey) {
    return createAccessKeyRequiredResponse();
  }

  try {
    const state = await loadCloudStateServer(accessKey);
    return NextResponse.json({ enabled: true, state }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      {
        enabled: true,
        error: "Errore cloud",
      },
      {
        headers: noStoreHeaders,
        status: 500,
      },
    );
  }
}

export async function PUT(request: Request) {
  if (!isCloudSyncEnabledOnServer()) {
    return NextResponse.json(
      { enabled: false, error: "Cloud sync non configurato" },
      {
        headers: noStoreHeaders,
        status: 503,
      },
    );
  }

  const accessKey = getCloudAccessKeyFromRequest(request);
  if (!accessKey) {
    return createAccessKeyRequiredResponse();
  }

  const body = await request.json().catch(() => null);
  const patch = normalizeCloudStatePatch(body);

  if (!hasCloudPatchContent(patch)) {
    return NextResponse.json(
      { error: "Nessun dato da salvare" },
      {
        headers: noStoreHeaders,
        status: 400,
      },
    );
  }

  try {
    const state = await saveCloudStateServer(accessKey, patch);
    return NextResponse.json({ enabled: true, state }, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      {
        enabled: true,
        error: "Errore cloud",
      },
      {
        headers: noStoreHeaders,
        status: 500,
      },
    );
  }
}
