import { getStore } from "@netlify/blobs";
import { requireMember, assertSameOrigin, json, errorResponse, httpError, canManageSite, audit, dbPool } from "../lib/netlify.mjs";

const store = () => getStore({ name: "site-assets", consistency: "strong" });

export default async function siteAsset(request) {
  try {
    const url = new URL(request.url);
    if (request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!/^[a-z0-9_-]{1,40}\/[a-f0-9-]{36}\.[a-z0-9]{2,8}$/i.test(key)) throw httpError(400, "Invalid asset key.");
      const result = await store().getWithMetadata(key, { type: "blob", consistency: "strong" });
      if (!result) throw httpError(404, "Asset not found.");
      return new Response(result.data, {
        headers: {
          "content-type": result.metadata?.contentType || "application/octet-stream",
          "cache-control": "public, max-age=3600, immutable",
          "x-content-type-options": "nosniff"
        }
      });
    }

    if (request.method === "POST") {
      assertSameOrigin(request);
      const { profile } = await requireMember();
      if (!canManageSite(profile)) throw httpError(403, "Only the Vice President or President can upload website artwork.");
      const form = await request.formData();
      const file = form.get("file");
      const pageId = String(form.get("pageId") || "portal").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "portal";
      if (!(file instanceof Blob)) throw httpError(400, "Choose an image to upload.");
      if (!String(file.type || "").startsWith("image/")) throw httpError(400, "Only image files are accepted.");
      if (file.size > 12 * 1024 * 1024) throw httpError(400, "Image must be smaller than 12 MB.");
      const originalName = String(file.name || "background.webp");
      const extension = (originalName.split(".").pop() || "webp").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "webp";
      const key = `${pageId}/${crypto.randomUUID()}.${extension.toLowerCase()}`;
      await store().set(key, file, { metadata: { contentType: file.type, originalName, uploadedBy: profile.id, pageId } });
      await audit(dbPool(), profile, "site.background-upload", "page_settings", { page_id: pageId });
      return json({ url: `/api/site-asset?key=${encodeURIComponent(key)}` }, 201);
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/site-asset" };
