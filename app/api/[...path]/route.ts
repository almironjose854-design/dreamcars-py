import { ApiError } from "../../../lib/store";
import {
  generateRecoveryCodes,
  login,
  logout,
  recoverWithCode,
  requireAdmin,
  revokeSessions,
  sessionInfo,
  updateAccount
} from "../../../lib/admin-auth";
import { authResponse, body, json, origin } from "../../../lib/api/http";
import {
  getCatalog,
  getHealth,
  getMedia,
  postInquiry,
  postMetric
} from "../../../lib/api/public-controllers";
import {
  deleteInquiryHandler,
  deleteVehicleHandler,
  getAdminData,
  getBackup,
  patchInquiryHandler,
  postCloudinary,
  postRestore,
  postTestNotification,
  postUploadLocal,
  postUploadSignature,
  putSettings,
  putVehicle
} from "../../../lib/api/admin-controllers";

export const dynamic = "force-dynamic";

async function handle(req: Request) {
  try {
    const path = new URL(req.url).pathname.replace(/^\/api\//, "");
    const method = req.method;
    if (method !== "GET") origin(req);

    if (path === "catalog" && method === "GET") return await getCatalog();
    if (path === "health" && method === "GET") return await getHealth();
    if (path === "session" && method === "GET") return json(await sessionInfo(req));

    if (path === "auth/login" && method === "POST") {
      const data = await login(req, await body(req));
      return authResponse(data.result, data.cookie);
    }
    if (path === "auth/recover" && method === "POST") {
      const data = await recoverWithCode(req, await body(req));
      return authResponse(data.result, data.cookie);
    }
    if (path === "auth/logout" && method === "POST") {
      return authResponse({ ok: true }, await logout(req));
    }
    if (path === "auth/account" && method === "PUT") {
      const data = await updateAccount(req, await body(req));
      return authResponse(data.result, data.cookie);
    }
    if (path === "auth/revoke" && method === "POST") {
      return authResponse({ ok: true }, await revokeSessions(req));
    }

    const mediaMatch = path.match(/^media\/([a-zA-Z0-9._-]{1,100})$/);
    if (mediaMatch && method === "GET") return await getMedia(mediaMatch[1]);

    if (path === "metrics" && method === "POST") return await postMetric(req);
    if (path === "inquiries" && method === "POST") return await postInquiry(req);

    if (path.startsWith("admin/")) {
      const auth = await requireAdmin(req);
      const actor = auth.account.username;

      if (path === "admin/data" && method === "GET") return await getAdminData();
      if (path === "admin/upload-local" && method === "POST") return await postUploadLocal(req);

      const vehicleMatch = path.match(/^admin\/vehicles\/([a-z0-9-]{1,80})$/);
      if (vehicleMatch && method === "PUT") return await putVehicle(req, vehicleMatch[1], actor);
      if (vehicleMatch && method === "DELETE") return await deleteVehicleHandler(req, vehicleMatch[1], actor);

      if (path === "admin/settings" && method === "PUT") return await putSettings(req, actor);
      if (path === "admin/test-notification" && method === "POST") return await postTestNotification(req);

      const inquiryMatch = path.match(/^admin\/inquiries\/([a-f0-9-]{36})$/);
      if (inquiryMatch && method === "DELETE") return await deleteInquiryHandler(req, inquiryMatch[1], actor);
      if (inquiryMatch && method === "PATCH") return await patchInquiryHandler(req, inquiryMatch[1], actor);

      if (path === "admin/cloudinary" && method === "POST") return await postCloudinary(req, actor);
      if (path === "admin/upload-signature" && method === "POST") return await postUploadSignature(req);
      if (path === "admin/backup" && method === "GET") return await getBackup();
      if (path === "admin/restore" && method === "POST") return await postRestore(req, actor);
      if (path === "admin/recovery-codes" && method === "POST") {
        return json(await generateRecoveryCodes(req, await body(req)));
      }
    }

    throw new ApiError(404, "Ruta no encontrada.");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    const issues = error && typeof error === "object" ? (error as { issues?: unknown }).issues : undefined;
    if (Array.isArray(issues)) {
      return json(
        {
          error: "Revisá los campos del formulario.",
          details: issues.map(issue => {
            const item = issue as { message?: unknown; path?: unknown };
            const path = Array.isArray(item.path) ? item.path.map(String).join(".") : "formulario";
            return `${path}: ${typeof item.message === "string" ? item.message : "valor inválido"}`;
          })
        },
        400
      );
    }
    console.error("API request failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "No se pudo completar la operación. Intentá de nuevo." }, 500);
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
