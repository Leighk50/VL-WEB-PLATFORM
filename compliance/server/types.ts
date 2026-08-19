export type Role =
  "administrator" | "venue_manager" | "staff" | "contractor" | "auditor";
export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  venueId: number | null;
  moduleAccess: "fire" | "food" | "both";
}
export interface AuthRequest extends Express.Request {
  user?: User;
}
