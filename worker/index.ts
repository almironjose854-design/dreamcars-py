import handler from "vinext/server/fetch-handler";

const worker = {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (new URL(request.url).pathname.startsWith("/admin")) headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export default worker;
