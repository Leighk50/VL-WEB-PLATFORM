import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { config } from "./config.js";
import type { Role, User } from "./types.js";

const secret = () => {
  return config.JWT_SECRET || "local-development-only-change-this-secret";
};

export interface AuthedRequest extends Request {
  user?: User;
}

// Tokens identify a session subject only. Role, venue and active state are reloaded
// from the database on every request so account changes take effect immediately.
export function tokenFor(user: Pick<User, "id">) {
  return jwt.sign({}, secret(), {
    subject: String(user.id),
    expiresIn: "8h",
    issuer: "vl-compliance",
  });
}

export async function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const raw = req.headers.authorization?.replace(/^Bearer /, "");
  if (!raw) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(raw, secret(), { issuer: "vl-compliance" });
    const subject = typeof payload === "string" ? undefined : payload.sub;
    const user = await db.get<User>(
      "SELECT id,email,name,role,venue_id venueId FROM users WHERE id=? AND active=1",
      [Number(subject)],
    );
    if (!user)
      return res.status(401).json({ error: "Invalid or expired session" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

export const allow =
  (...roles: Role[]) =>
  (req: AuthedRequest, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role)
      ? next()
      : res.status(403).json({ error: "Insufficient permission" });

export const canWrite = allow(
  "administrator",
  "venue_manager",
  "staff",
  "contractor",
);
export const canAdmin = allow("administrator");
