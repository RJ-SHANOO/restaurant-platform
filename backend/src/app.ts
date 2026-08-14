import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(compression());

app.use(
  cors({
    // Named origins only. '*' is tempting and appears to work, but it means
    // any website on the internet can call this API from a visitor's browser.
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error(`Origin ${origin} is not allowed to call this API.`));
    },
    credentials: false,
  }),
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (!env.isProduction) {
  app.use(morgan('dev'));
}

app.get('/health', (_req, res) => {
  res.json({ success: true, message: `${env.appName} is running.`, data: { uptime: process.uptime() } });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
