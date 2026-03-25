import { createHash } from "node:crypto";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { emptyCloudState, normalizeCloudState, type CloudState, type CloudStatePatch } from "./cloud-shared";

const STORAGE_PATH = process.env.SUPABASE_STORAGE_PATH || "note-di-jaco/state.json";

function normalizeCloudAccessKey(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveScopedStoragePath(accessKey: string) {
  const baseDir = path.posix.dirname(STORAGE_PATH);
  const fileName = path.posix.basename(STORAGE_PATH);
  const accessKeyHash = createHash("sha256").update(accessKey).digest("hex");

  if (baseDir === ".") {
    return `${accessKeyHash}/${fileName}`;
  }

  return `${baseDir}/${accessKeyHash}/${fileName}`;
}

function getRequiredEnv() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;

  if (!url || !serviceRoleKey || !bucket) return null;
  return { url, serviceRoleKey, bucket };
}

function isNotFoundError(error: { message?: string; status?: number; statusCode?: number | string } | null | undefined) {
  if (!error) return false;
  if (error.status === 404 || error.statusCode === 404 || error.statusCode === "404") return true;
  const message = String(error.message || "").toLowerCase();
  return message.includes("not found") || message.includes("404");
}

function getClient(accessKey: string) {
  const env = getRequiredEnv();
  if (!env) throw new Error("Cloud sync non configurato");

  return {
    bucket: env.bucket,
    legacyPath: STORAGE_PATH,
    path: resolveScopedStoragePath(accessKey),
    client: createClient(env.url, env.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  };
}

type CloudStorageClient = ReturnType<typeof getClient>["client"];

export function isCloudSyncEnabledOnServer() {
  return !!getRequiredEnv();
}

export function getCloudAccessKeyFromRequest(request: Request) {
  const headerValue = request.headers.get("x-cloud-access-key");
  const authorization = request.headers.get("authorization");
  const bearerValue = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  return normalizeCloudAccessKey(headerValue ?? bearerValue);
}

async function readCloudStateFile(
  client: CloudStorageClient,
  bucket: string,
  filePath: string,
): Promise<{ found: boolean; raw: string }> {
  const { data, error } = await client.storage.from(bucket).download(filePath);

  if (error) {
    if (isNotFoundError(error)) {
      return {
        found: false,
        raw: "",
      };
    }

    throw error;
  }

  return {
    found: true,
    raw: await data.text(),
  };
}

export async function loadCloudStateServer(accessKey: string): Promise<CloudState> {
  if (!isCloudSyncEnabledOnServer()) return emptyCloudState();

  const { client, bucket, path, legacyPath } = getClient(accessKey);
  const scopedStateFile = await readCloudStateFile(client, bucket, path);

  if (scopedStateFile.found) {
    if (!scopedStateFile.raw.trim()) return emptyCloudState();
    return normalizeCloudState(JSON.parse(scopedStateFile.raw));
  }

  if (legacyPath !== path) {
    const legacyStateFile = await readCloudStateFile(client, bucket, legacyPath);

    if (legacyStateFile.found) {
      if (!legacyStateFile.raw.trim()) return emptyCloudState();

      const migratedState = normalizeCloudState(JSON.parse(legacyStateFile.raw));

      await client.storage.from(bucket).upload(path, JSON.stringify(migratedState, null, 2), {
        contentType: "application/json; charset=utf-8",
        upsert: true,
      });

      return migratedState;
    }
  }

  return emptyCloudState();
}

export async function saveCloudStateServer(accessKey: string, patch: CloudStatePatch): Promise<CloudState> {
  if (!isCloudSyncEnabledOnServer()) throw new Error("Cloud sync non configurato");

  const { client, bucket, path } = getClient(accessKey);
  const current = await loadCloudStateServer(accessKey);
  const timestamp = Date.now();

  const next: CloudState = {
    notes: patch.notes ?? current.notes,
    customEmojis: patch.customEmojis ?? current.customEmojis,
    notesUpdatedAt: patch.notes ? timestamp : current.notesUpdatedAt,
    customEmojisUpdatedAt: patch.customEmojis ? timestamp : current.customEmojisUpdatedAt,
    updatedAt: timestamp,
  };

  const { error } = await client.storage.from(bucket).upload(path, JSON.stringify(next, null, 2), {
    contentType: "application/json; charset=utf-8",
    upsert: true,
  });

  if (error) throw error;
  return next;
}
