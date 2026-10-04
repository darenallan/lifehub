import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { AuthError, makeAuthenticate } from './auth.js';
import { COLLECTIONS } from './collections.js';
import { registerRoutes } from './routes.js';

/** Construit l'app sans écouter : réutilisée par server.js et par les tests (app.inject). */
export async function buildApp({
  db,
  verifyToken,
  config,
  collections = COLLECTIONS,
  logger = false,
}) {
  const app = Fastify({
    logger,
    bodyLimit: 256 * 1024,
    trustProxy: config.isHosted, // derrière le proxy Render : vraie IP pour le rate limit
    // Par défaut Fastify supprime les champs en trop et convertit les types : on veut un refus net.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  // API JSON appelée depuis le domaine Vercel : la ressource doit être lisible cross-origin.
  await app.register(helmet, { crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: config.allowedOrigins,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AuthError) return reply.code(err.status).send({ error: err.code });
    if (err.validation) return reply.code(400).send({ error: 'bad_request' });
    if (err.statusCode && err.statusCode < 500) {
      return reply.code(err.statusCode).send({ error: err.code ?? 'error' });
    }
    request.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  const authenticate = makeAuthenticate({ verifyToken, adminEmail: config.adminEmail });
  registerRoutes(app, { db, collections, authenticate });
  return app;
}
