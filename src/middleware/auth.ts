import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireRole = (roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Missing user context' });
      }

      // Fetch user from DB to check role
      const userRes = await db.select().from(users).where(eq(users.uid, req.user.uid));
      const dbUser = userRes[0];

      if (!dbUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!roles.includes(dbUser.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }

      req.dbUser = dbUser;
      next();
    } catch (error) {
      console.error('Error checking role:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};
