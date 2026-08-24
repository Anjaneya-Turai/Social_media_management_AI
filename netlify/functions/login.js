export default async (request) => {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (request.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  const secret = process.env.ADMIN_PASSCODE;
  if (!secret)
    return new Response(
      JSON.stringify({ ok: false, error: "ADMIN_PASSCODE is not set on the site" }),
      { status: 500, headers }
    );

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const ok = body.passcode === secret;
  return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 401, headers });
};
