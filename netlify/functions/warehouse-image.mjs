import { getStore } from "@netlify/blobs";
import { requireMember, assertSameOrigin, json, errorResponse, httpError } from "../lib/netlify.mjs";

const store = () => getStore({ name: "warehouse-images", consistency: "strong" });

export default async function warehouseImage(request) {
  try {
    const { profile } = await requireMember();
    const url = new URL(request.url);
    if (request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{2,8}$/i.test(key)) throw httpError(400, "Invalid image key.");
      const result = await store().getWithMetadata(key, { type: "blob", consistency: "strong" });
      if (!result) throw httpError(404, "Image not found.");
      return new Response(result.data, {
        headers: {
          "content-type": result.metadata?.contentType || "application/octet-stream",
          "cache-control": "private, max-age=300",
          "x-content-type-options": "nosniff"
        }
      });
    }
    if (request.method === "POST") {
      assertSameOrigin(request);
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) throw httpError(400, "Choose an image to upload.");
      if (!String(file.type || "").startsWith("image/")) throw httpError(400, "Only image files are accepted.");
      if (file.size > 8 * 1024 * 1024) throw httpError(400, "Image must be smaller than 8 MB.");
      const originalName = String(file.name || "image.webp");
      const extension = (originalName.split(".").pop() || "webp").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "webp";
      const key = `${profile.id}/${crypto.randomUUID()}.${extension.toLowerCase()}`;
      await store().set(key, file, { metadata: { contentType: file.type, originalName, uploadedBy: profile.id } });
      return json({ url: `/api/warehouse-image?key=${encodeURIComponent(key)}` }, 201);
    }
    return json({ error: "Method not allowed." }, 405);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: "/api/warehouse-image" };
