import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "portal", consistency: "strong" });

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function read(key, fallback) {
  const v = await store().get(key, { type: "json" });
  return v == null ? fallback : v;
}

export default async (request) => {
  if (request.method === "GET") {
    const [plan, images, feedback] = await Promise.all([
      read("plan", null),
      read("images", {}),
      read("feedback", {}),
    ]);
    return json({ plan, images, feedback });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const { action } = body;
  const secret = process.env.ADMIN_PASSCODE;
  const isAdmin = Boolean(secret) && body.passcode === secret;

  if (action === "feedback") {
    const { postId, entry } = body;
    if (!postId || !entry) return json({ error: "postId and entry are required" }, 400);
    const feedback = await read("feedback", {});
    feedback[postId] = entry;
    await store().setJSON("feedback", feedback);
    return json({ feedback });
  }

  if (!isAdmin) return json({ error: "Admin passcode does not match" }, 401);

  if (action === "plan") {
    if (!body.plan) return json({ error: "plan is required" }, 400);
    await store().setJSON("plan", body.plan);
    return json({ ok: true });
  }

  if (action === "image") {
    const { postId, dataUrl } = body;
    if (!postId) return json({ error: "postId is required" }, 400);
    const images = await read("images", {});
    if (dataUrl) images[postId] = dataUrl;
    else delete images[postId];
    await store().setJSON("images", images);
    return json({ images });
  }

  return json({ error: "Unknown action" }, 400);
};
