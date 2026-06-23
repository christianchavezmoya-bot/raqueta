import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 3001);
  const prefix = configService.get<string>('API_PREFIX', 'api/v1');
  const lanHost = configService.get<string>('LAN_HOST');

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
    .setTitle('Raqueta API')
    .setDescription('Tennis Community & Club Management Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');
  console.log(`🎾 Raqueta API running on: http://localhost:${port}/${prefix}`);
  if (lanHost) {
    console.log(`🌐 Raqueta API LAN URL: http://${lanHost}:${port}/${prefix}`);
  }
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
