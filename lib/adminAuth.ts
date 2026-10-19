import type { SessionData } from "./session";

/**
 * Checks whether the current session has admin privileges.
 * Rules:
 * 1. session exists
 * 2. session.userId === 1 (first owner/admin fallback)
 * 3. session.username is in comma-separated process.env.ADMIN_USERS
 * 4. session.username matches process.env.APP_USERNAME (default "admin")
 */
export function isAdminSession(session: SessionData | null | undefined): boolean {
  if (!session) return false;
  if (session.userId === 1) return true;

  const adminUsersEnv = process.env.ADMIN_USERS;
  if (adminUsersEnv) {
    const list = adminUsersEnv
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);
    if (list.includes(session.username.toLowerCase())) {
      return true;
    }
  }

  const appUsername = process.env.APP_USERNAME || "admin";
  if (session.username.toLowerCase() === appUsername.toLowerCase()) {
    return true;
  }

  return false;
}
