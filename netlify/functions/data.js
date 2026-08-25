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
    const [plan, images, feedback, brand] = await Promise.all([
      read("plan", null),
      read("images", {}),
      read("feedback", {}),
      read("brand", {}),
    ]);
    return json({ plan, images, feedback, brand });
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

  // Open to anyone with the link: clients leaving notes and approvals.
  if (action === "feedback") {
    const { postId, entry } = body;
    if (!postId || !entry) return json({ error: "postId and entry are required" }, 400);
    const feedback = await read("feedback", {});
    feedback[postId] = entry;
    await store().setJSON("feedback", feedback);
    return json({ feedback });
  }

  // Everything below requires the admin passcode.
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

  if (action === "brand") {
    if (!body.brand || typeof body.brand !== "object")
      return json({ error: "brand object is required" }, 400);
    await store().setJSON("brand", body.brand);
    return json({ brand: body.brand });
  }

  if (action === "post-update") {
    const { postId, fields, theme } = body;
    if (!postId || !fields) return json({ error: "postId and fields are required" }, 400);
    const plan = await read("plan", null);
    if (!plan) return json({ error: "No plan published" }, 404);
    const idx = plan.posts.findIndex((p) => p.id === postId);
    if (idx === -1) return json({ error: "Post not found" }, 404);
    plan.posts[idx] = {
      ...plan.posts[idx],
      fields,
      theme: theme == null ? plan.posts[idx].theme : theme,
    };
    await store().setJSON("plan", plan);
    return json({ plan });
  }

  if (action === "post-delete") {
    const { postId } = body;
    if (!postId) return json({ error: "postId is required" }, 400);
    const [plan, images, feedback] = await Promise.all([
      read("plan", null),
      read("images", {}),
      read("feedback", {}),
    ]);
    if (!plan) return json({ error: "No plan published" }, 404);
    plan.posts = plan.posts.filter((p) => p.id !== postId);
    plan.days = plan.days
      .map((d) => ({ ...d, postIds: d.postIds.filter((id) => id !== postId) }))
      .filter((d) => d.postIds.length);
    delete images[postId];
    delete feedback[postId];
    await Promise.all([
      store().setJSON("plan", plan),
      store().setJSON("images", images),
      store().setJSON("feedback", feedback),
    ]);
    return json({ plan, images, feedback });
  }

  if (action === "clear") {
    await Promise.all([
      store().delete("plan"),
      store().delete("images"),
      store().delete("feedback"),
    ]);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};
