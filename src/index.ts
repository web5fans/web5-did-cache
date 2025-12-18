import express from 'express';
import { didRouter, getDidHandler } from './api/did';
import { initDb } from './db';
import dotenv from 'dotenv';
import { initPlatformAddresses } from './services/ckbService';
import { startDidCheckTask } from './services/didCheckService';
import { initLogger } from './utils/logger';

// Load environment variables
dotenv.config();

// Init logger (time-prefixed console output)
initLogger();

// Create Express application
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.send('OK');
});

// Routes
app.use('/api/did', didRouter);
app.get('/:did', getDidHandler);

// Start server
async function startServer() {
  try {
    // Initialize database
    await initDb();
    
    // Initialize platform addresses
    await initPlatformAddresses();
    
    // Start periodic check did records
    // Check every 30 seconds
    startDidCheckTask(30);
    
    app.listen(port, () => {
      console.log(`Server is running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
