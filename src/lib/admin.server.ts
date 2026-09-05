import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_USERNAME = "root";
export const ADMIN_PASSWORD = "dark";

export type AdminSession = { admin?: boolean };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "cyberng",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export function getAdminSession() {
  return useSession<AdminSession>(sessionConfig());
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function credentialsMatch(username: string, password: string) {
  const u = timingSafeEqual(digest(username), digest(ADMIN_USERNAME));
  const p = timingSafeEqual(digest(password), digest(ADMIN_PASSWORD));
  return u && p;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.data.admin) {
    throw new Error("Not authorized");
  }
  return session;
}
