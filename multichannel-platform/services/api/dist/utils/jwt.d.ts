import { UserClaims } from '@multichannel/shared';
export declare function signAccessToken(claims: UserClaims): string;
export declare function signRefreshToken(userId: string): string;
export declare function verifyAccessToken(token: string): UserClaims;
export declare function verifyRefreshToken(token: string): {
    userId: string;
};
//# sourceMappingURL=jwt.d.ts.map