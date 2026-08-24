import app from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { startCommissionRunScheduler } from './jobs/commissionRunScheduler';

async function start() {
  try {
    await prisma.$connect();
    console.log('Database connected.');
  } catch (error) {
    console.error('Could not reach the database. Check DATABASE_URL in .env.');
    console.error(error);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`${env.appName} API listening on http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
  });

  startCommissionRunScheduler();

  // Close the pool cleanly on redeploy, so connections are not left dangling
  // against Neon's limit.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down.`);
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void start();
