import bcrypt from "bcryptjs";
import { conflict, unauthorized } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/** Sanitized user payload returned to the client — never includes the hash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  plan: string;
  planStatus: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  plan: string;
  planStatus: string;
  createdAt: Date;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    planStatus: user.planStatus,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerUser(
  email: string,
  password: string,
  name: string,
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists");
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, passwordHash, name },
  });
  return toPublicUser(user);
}

export async function loginUser(email: string, password: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw unauthorized("Invalid email or password");
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");
  return toPublicUser(user);
}

export async function getUserById(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw unauthorized("Session user no longer exists");
  return toPublicUser(user);
}
