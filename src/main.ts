import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { buildShareLinks } from './agents/share-links';
import { SignalingGateway } from './signaling/signaling.gateway';
import { AgentOrchestratorService } from './agents/agent-orchestrator.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Agents may inline images as data URLs; keep the JSON limit comfortably above the 5 MB image cap.
  app.useBodyParser('json', { limit: '12mb' });
  app.useBodyParser('urlencoded', { limit: '12mb', extended: true });

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const HTTP_PORT = parseInt(process.env.PORT || '3000', 10);
  const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);

  // Listen on HTTP for all network interfaces (0.0.0.0)
  await app.listen(HTTP_PORT, '0.0.0.0');

  // Check for SSL certificate to attach HTTPS server for mobile devices
  const sslDir = path.join(__dirname, '..', 'ssl');
  const keyPath = path.join(sslDir, 'key.pem');
  const certPath = path.join(sslDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      const expressApp = app.getHttpAdapter().getInstance();
      const httpsServer = https.createServer(httpsOptions, expressApp);

      const signalingGateway = app.get(SignalingGateway);
      if (signalingGateway && signalingGateway.server) {
        signalingGateway.server.attach(httpsServer);
      }

      httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        logger.log(`🔒 HTTPS server listening on port ${HTTPS_PORT}`);
      });
    } catch (sslErr) {
      logger.warn('Could not start HTTPS server', sslErr);
    }
  }

  // Agents connect to this server as ordinary Socket.IO clients, so they can
  // only be launched once the HTTP listener is actually accepting connections.
  try {
    const orchestrator = app.get(AgentOrchestratorService);
    await orchestrator.launch();
  } catch (agentErr) {
    logger.error('Failed to launch the agent population', agentErr as any);
  }

  const links = buildShareLinks(HTTP_PORT, HTTPS_PORT);
  const ip = links.primaryAddress ?? 'localhost';
  logger.log(`=======================================================`);
  logger.log(`📱 LAN IPv4 Address:      ${ip}`);
  logger.log(`🌐 Web App (share this):  http://${ip}:${HTTP_PORT}`);
  logger.log(`🔒 Mobile (HTTPS):        https://${ip}:${HTTPS_PORT}`);
  logger.log(`🛰️  AGENT OBSERVATORY:     http://${ip}:${HTTP_PORT}/observatory`);
  for (const extra of links.all.slice(1)) {
    logger.log(`   ↳ also on ${extra.address}:  ${extra.observatory}`);
  }
  logger.log(`💻 Localhost:             http://localhost:${HTTP_PORT}`);
  logger.log(`🗄️  PostgreSQL:           localhost:5432 (DB: ${process.env.DB_NAME || 'calling_platform'})`);
  logger.log(`🌐 Adminer DB GUI:        http://${ip}:8080`);
  logger.log(`=======================================================`);
}
bootstrap();
