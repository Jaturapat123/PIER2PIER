'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const requestId = require('./middleware/requestId');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const serviceRoutes = require('./routes/services');
const scheduleRoutes = require('./routes/schedules');
const containerTypeRoutes = require('./routes/containerTypes');
const bookingRoutes = require('./routes/bookings');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');

function createApp() {
  const app = express();

  // อยู่หลัง ALB — ต้องเชื่อ X-Forwarded-* ไม่งั้น req.ip เป็น IP ของ ALB ทุกอัน
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
      credentials: false,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestId);

  if (env.nodeEnv !== 'test') {
    morgan.token('id', (req) => req.id);
    app.use(morgan(':id :method :url :status :response-time ms'));
  }

  // health ไม่มี prefix /api เพราะ ALB target group ชี้ที่ /health ตรง ๆ
  app.use('/', healthRoutes);

  app.use('/api/auth', authRoutes);
  app.use('/api/services', serviceRoutes);
  app.use('/api/schedules', scheduleRoutes);
  app.use('/api/container-types', containerTypeRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
