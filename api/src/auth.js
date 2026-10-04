import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

const GOOGLE_JWKS = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);

export class AuthError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/**
 * Vérifie un ID token Firebase (RS256, émetteur et audience du projet).
 * emulator : jetons non signés de l'émulateur Auth, uniquement en local (voir assertConfig).
 */
export function createTokenVerifier({ projectId, emulator = false }) {
  const issuer = `https://securetoken.google.com/${projectId}`;

  if (emulator) {
    return async (token) => {
      const claims = decodeJwt(token);
      const now = Math.floor(Date.now() / 1000);
      if (claims.iss !== issuer || claims.aud !== projectId || !claims.exp || claims.exp < now) {
        throw new AuthError(401, 'invalid_token');
      }
      return claims;
    };
  }

  const jwks = createRemoteJWKSet(GOOGLE_JWKS);
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: projectId,
      algorithms: ['RS256'],
    });
    return payload;
  };
}

/** Rôle côté serveur : seule source de vérité. Les colocs (members) arrivent en phase 4. */
export function resolveRole(user, adminEmail) {
  if (adminEmail && user.email === adminEmail) return 'admin';
  return null;
}

/** preHandler Fastify : request.user = { uid, email, name, role }. */
export function makeAuthenticate({ verifyToken, adminEmail }) {
  return async function authenticate(request) {
    const header = request.headers.authorization ?? '';
    const match = /^Bearer ([\w-]+\.[\w-]+\.[\w-]*)$/.exec(header);
    if (!match) throw new AuthError(401, 'missing_token');

    let claims;
    try {
      claims = await verifyToken(match[1]);
    } catch {
      throw new AuthError(401, 'invalid_token');
    }
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) {
      throw new AuthError(401, 'invalid_token');
    }
    if (claims.email_verified !== true) throw new AuthError(403, 'email_not_verified');

    const user = {
      uid: claims.sub,
      email: String(claims.email ?? '').toLowerCase(),
      name: typeof claims.name === 'string' ? claims.name : '',
    };
    request.user = { ...user, role: resolveRole(user, adminEmail) };
  };
}
