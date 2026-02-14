import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application, RequestHandler } from 'express';
import { config } from './index';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: "Travel Life API Documentation",
      version: '1.0.0',
      description: 'API documentation for Travel Life travel documentation application',
      contact: {
        name: 'API Support',
        url: 'https://github.com/dsbaciga/travel-life',
      },
    },
    servers: [
      {
        url: config.baseUrl,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/types/*.ts'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: Application) {
  // swagger-ui-express types conflict with Express 5 types
  // The serve middleware returns RequestHandler[] but app.use expects different signature
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- swagger-ui-express type definitions conflict with Express 5
  app.use('/api-docs', ...(swaggerUi.serve as RequestHandler[]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- swagger-ui-express setup returns incompatible type with Express 5
  app.get('/api-docs', swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }) as RequestHandler);

  console.log(`Swagger documentation available at ${config.baseUrl}/api-docs`);
}

