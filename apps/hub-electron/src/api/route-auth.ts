import type { UserRole } from "@gaurav-pos/shared";
import type { AuthService, LocalDeviceSession } from "../domain/auth-service.js";
import { DomainError } from "../domain/errors.js";
import type { HeaderRequest, HubRouteAuth } from "./route-context.js";

export type TokenRequest = HeaderRequest & {
  query?: unknown;
};

export function getRequestToken(request: TokenRequest): string | undefined {
  const authorization = request.headers.authorization;
  const headerToken = request.headers["x-device-token"];
  const protocolHeader = request.headers["sec-websocket-protocol"];
  const protocolToken =
    typeof protocolHeader === "string"
      ? protocolHeader
          .split(",")
          .map((value) => value.trim())
          .find((value) => value.startsWith("pos-token."))
          ?.slice("pos-token.".length)
      : undefined;
  const query = request.query as { token?: string } | undefined;
  return typeof headerToken === "string"
    ? headerToken
    : typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : protocolToken ?? query?.token;
}

export function createRouteAuth(authService: AuthService): HubRouteAuth & { getToken: typeof getRequestToken } {
  const requireRoles = (roles: UserRole[]) => async (request: HeaderRequest) => {
    const session = authService.authenticate(getRequestToken(request));
    if (!roles.includes(session.role)) throw new DomainError("Device role is not allowed for this action", 403);
  };
  const getSession = (request: HeaderRequest): LocalDeviceSession => authService.authenticate(getRequestToken(request));

  return {
    anyRole: requireRoles(["admin", "captain", "waiter", "kitchen"]),
    adminOnly: requireRoles(["admin"]),
    captainOrAdmin: requireRoles(["admin", "captain"]),
    orderRole: requireRoles(["admin", "captain", "waiter"]),
    orderMoveRole: requireRoles(["admin", "captain"]),
    kitchenRole: requireRoles(["admin", "kitchen"]),
    getSession,
    getToken: getRequestToken
  };
}
