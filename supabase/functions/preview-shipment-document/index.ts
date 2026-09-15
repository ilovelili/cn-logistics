import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

interface PreviewRequest {
  document_id?: unknown;
}

interface PreviewableDocument {
  storage_path: string;
}

const allowedOrigins = new Set([
  "https://navigator.cnlogistics.co.jp",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const shipmentDocumentBucket = "shipment-documents";
const previewUrlLifetimeSeconds = 5 * 60;

const baseCorsHeaders = {
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  return origin && allowedOrigins.has(origin)
    ? {
        ...baseCorsHeaders,
        "access-control-allow-origin": origin,
        vary: "origin",
      }
    : baseCorsHeaders;
}

function jsonResponse(request: Request, body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required Edge Function secret: ${name}`);
  }
  return value;
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      const headers = corsHeaders(request);
      if (!("access-control-allow-origin" in headers)) {
        return new Response(null, { status: 403, headers });
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse(request, { error: "Method not allowed" }, 405);
    }

    const authorization = request.headers.get("authorization")?.trim();
    if (!authorization?.startsWith("Bearer ")) {
      return jsonResponse(
        request,
        { error: "Authentication is required" },
        401,
      );
    }

    try {
      const body = (await request.json()) as PreviewRequest;
      const documentId =
        typeof body.document_id === "string" ? body.document_id.trim() : "";
      if (!uuidPattern.test(documentId)) {
        return jsonResponse(
          request,
          { error: "A valid document ID is required" },
          400,
        );
      }

      const supabaseUrl = requiredEnv("SUPABASE_URL");
      const callerClient = createClient(
        supabaseUrl,
        requiredEnv("SUPABASE_ANON_KEY"),
        {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const adminClient = createClient(
        supabaseUrl,
        requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );

      const { data, error } = await callerClient.rpc(
        "get_previewable_shipment_document",
        { target_document_id: documentId },
      );
      const previewableDocument = (data?.[0] ??
        null) as PreviewableDocument | null;

      if (error || !previewableDocument?.storage_path) {
        return jsonResponse(
          request,
          { error: "Document preview is not available" },
          403,
        );
      }

      const { data: signedUrl, error: signedUrlError } =
        await adminClient.storage
          .from(shipmentDocumentBucket)
          .createSignedUrl(
            previewableDocument.storage_path,
            previewUrlLifetimeSeconds,
          );

      if (signedUrlError || !signedUrl?.signedUrl) {
        return jsonResponse(
          request,
          { error: "Document preview could not be prepared" },
          500,
        );
      }

      return jsonResponse(request, {
        file_url: signedUrl.signedUrl,
        expires_in: previewUrlLifetimeSeconds,
      });
    } catch (error) {
      console.error("Document preview failed", error);
      return jsonResponse(request, { error: "Document preview failed" }, 500);
    }
  },
};
