import jwt from 'jsonwebtoken';
import { config } from '../config';
import { UserClaims } from '@multichannel/shared';

export function signAccessToken(claims: UserClaims): string {
  return jwt.sign(claims, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn as any,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });
}

export function verifyAccessToken(token: string): UserClaims {
  return jwt.verify(token, config.jwt.secret) as UserClaims;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, config.jwt.refreshSecret) as { userId: string };
}
