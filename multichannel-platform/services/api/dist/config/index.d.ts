export declare const config: {
    env: string;
    port: number;
    mongoUri: string;
    jwt: {
        secret: string;
        refreshSecret: string;
        accessExpiresIn: string;
        refreshExpiresIn: string;
    };
    encryptionKey: string;
    redis: {
        host: string;
        port: number;
        password: string | undefined;
        useEmbeddedFallback: boolean;
    };
    corsOrigin: string;
    apiBaseUrl: string;
    webBaseUrl: string;
    rateLimits: {
        windowMs: number;
        max: number;
    };
    ebay: {
        clientId: string;
        clientSecret: string;
        ruName: string;
        environment: string;
        scopes: string;
    };
    shopify: {
        apiKey: string;
        apiSecret: string;
        scopes: string;
        redirectUri: string;
    };
};
//# sourceMappingURL=index.d.ts.map