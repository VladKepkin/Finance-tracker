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

  const sessionUser = session.username.toLowerCase();
  const defaultAdmin = (process.env.APP_USERNAME || "admin").toLowerCase();

  const adminUsersEnv = process.env.ADMIN_USERS;
  if (adminUsersEnv) {
    const list = adminUsersEnv
      .split(",")
      .map((u) => u.trim().toLowerCase())
      .filter(Boolean);
    if (list.includes(sessionUser)) {
      return true;
    }
  }

  if (sessionUser === defaultAdmin) {
    return true;
  }

  if (session.userId === 1) {
    if (!process.env.APP_USERNAME || sessionUser === defaultAdmin) {
      return true;
    }
  }

  return false;
}
