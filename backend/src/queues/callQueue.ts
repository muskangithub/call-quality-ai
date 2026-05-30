import { Queue } from "bullmq";
import net from "net";
import { redisConnection } from "../config/redis.js";

export interface CallJobData {
  callId: string;
  filePath: string;
  originalName: string;
  mimeType: string;
}

let callQueue: Queue | null = null;

export function getCallQueue(): Queue | null {
  return callQueue;
}

/**
 * Check if Redis is reachable via TCP before creating BullMQ Queue.
 * This prevents BullMQ from spamming unhandled connection errors.
 */
function checkRedisReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: redisConnection.host,
      port: redisConnection.port,
    });

    socket.setTimeout(2000);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function initQueue(): Promise<boolean> {
  const reachable = await checkRedisReachable();
  if (!reachable) {
    return false;
  }

  try {
    callQueue = new Queue("call-processing", {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });

    console.log("✓ Call processing queue connected to Redis");
    return true;
  } catch {
    callQueue = null;
    return false;
  }
}
