"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
function signAccessToken(claims) {
    return jsonwebtoken_1.default.sign(claims, config_1.config.jwt.secret, {
        expiresIn: config_1.config.jwt.accessExpiresIn,
    });
}
function signRefreshToken(userId) {
    return jsonwebtoken_1.default.sign({ userId }, config_1.config.jwt.refreshSecret, {
        expiresIn: config_1.config.jwt.refreshExpiresIn,
    });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, config_1.config.jwt.secret);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, config_1.config.jwt.refreshSecret);
}
//# sourceMappingURL=jwt.js.map