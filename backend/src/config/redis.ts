import dotenv from "dotenv";

dotenv.config();

/**
 * Redis connection config used by BullMQ.
 * BullMQ creates its own ioredis instances internally —
 * we just pass the connection options.
 */
export const redisConnection = {
  host: process.env["REDIS_HOST"] ?? "localhost",
  port: Number(process.env["REDIS_PORT"] ?? 6379),
  maxRetriesPerRequest: null as null, // Required by BullMQ
  enableOfflineQueue: false,
};
