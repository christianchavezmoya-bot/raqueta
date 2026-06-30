import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3001);
  const prefix = configService.get<string>('API_PREFIX', 'api/v1');
  const host = configService.get<string>('API_HOST', '0.0.0.0');

  // Serve uploaded media files as public static assets at /storage/*
  const rawRoot = configService.get<string>('STORAGE_ROOT', './storage');
  if (!path.isAbsolute(rawRoot)) {
    console.warn(
      `⚠️  STORAGE_ROOT is a relative path ("${rawRoot}"). ` +
      `Files will be resolved against process.cwd() = "${process.cwd()}" at this startup. ` +
      `Set STORAGE_ROOT to an absolute path in .env to prevent uploads scattering across restarts.`,
    );
  }
  const storageRoot = path.isAbsolute(rawRoot) ? rawRoot : path.resolve(process.cwd(), rawRoot);
  console.log(`🗂️  Storage root: ${storageRoot}`);
  app.useStaticAssets(storageRoot, { prefix: '/storage' });

  app.setGlobalPrefix(prefix);

  app.enableCors({
    origin: [
      configService.get('FRONTEND_URL', 'http://localhost:3000'),
      configService.get('MOBILE_URL', 'exp://localhost:8081'),
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('N-Go API')
    .setDescription('Tennis Community & Club Management Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, host);
  console.log(`🎾 N-Go API running on: http://${host}:${port}/${prefix}`);
  console.log(`📚 Swagger docs: http://${host}:${port}/api/docs`);
  console.log(`🗄️  Storage served at: http://${host}:${port}/storage`);
}

bootstrap();
