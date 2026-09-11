import "server-only";

export { getCurrentProfile } from "./application/get-current-profile";
export {
  BackendUnavailableError,
  createQueryFailureError,
  isUnavailableAuthError,
} from "./domain/backend-availability";
export { isAuthenticationQueryError } from "./domain/postgrest-auth-error";
export { resolveSafeNextPath } from "./domain/safe-next-path";
export {
  getAllowedGoogleUserId,
  isGoogleOAuthEnabled,
} from "./infrastructure/google-auth-access";
export { getConfiguredSiteOrigin } from "./infrastructure/site-environment";
export { createRouteHandlerSupabaseClient } from "./infrastructure/supabase-route-handler";
export { createServerSupabaseClient } from "./infrastructure/supabase-server";
export { updateProfileAction } from "./presentation/actions";
