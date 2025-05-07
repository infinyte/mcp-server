/**
 * MCP Server Routes
 */
const express = require('express');
const adminRoutes = require('./admin');

const router = express.Router();

// Admin routes
router.use('/admin', adminRoutes);

module.exports = router;