import {
  canEditGameData,
  canManageFeatures,
  canManageImports,
  canManageSite,
  requireMember,
} from "./netlify.mjs";

function denied(message) {
  return { response: Response.json({ error: message }, { status: 403 }) };
}

async function authenticatedMember() {
  try {
    return await requireMember();
  } catch (error) {
    return {
      response: Response.json(
        { error: error?.message || "Authentication failed" },
        { status: error?.status || error?.statusCode || 500 },
      ),
    };
  }
}

export async function requireGameDataAdmin() {
  const auth = await authenticatedMember();
  if (auth.response) return auth;
  const allowed = canManageSite(auth.profile)
    || canManageImports(auth.profile)
    || canEditGameData(auth.profile);
  return allowed ? auth : denied("Admin or data-import permission required");
}

export async function requireSiteAdmin() {
  const auth = await authenticatedMember();
  if (auth.response) return auth;
  const allowed = canManageSite(auth.profile) || canManageFeatures(auth.profile);
  return allowed ? auth : denied("Site or feature-management permission required");
}
