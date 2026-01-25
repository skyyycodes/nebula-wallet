/**
 * Vercel Serverless Function Entry Point
 * This exports only the Express app for API endpoints
 */
import { app } from '../src/api.js';
// Vercel requires a default export
export default app;
