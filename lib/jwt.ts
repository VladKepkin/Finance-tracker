import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "mt_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

export interface SessionData {
  userId: number;
  username: string;
}

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is not set (потрібно ≥16 символів)");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(data: SessionData): Promise<string> {
  return new SignJWT({ username: data.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(data.userId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) return null;
    return { userId, username: String(payload.username ?? "") };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_S;
