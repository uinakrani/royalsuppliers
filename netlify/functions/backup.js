const { exportAndUploadBackup } = require('../../lib/backupService')

exports.handler = async (event, context) => {
  // Set headers for CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    }
  }

  try {
    if (event.httpMethod === 'GET') {
      console.log('📦 Starting manual backup via Netlify Function...')

      const result = await exportAndUploadBackup('manual')

      if (result.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Backup completed successfully',
            fileName: result.fileName,
            timestamp: new Date().toISOString(),
          }),
        }
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Backup failed',
            error: result.error,
          }),
        }
      }
    } else if (event.httpMethod === 'POST') {
      // Optional: Check for secret key for scheduled backups
      const authHeader = event.headers.authorization || event.headers.Authorization
      const cronSecret = process.env.CRON_SECRET || ''

      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Unauthorized',
          }),
        }
      }

      console.log('📦 Starting scheduled backup via Netlify Function...')

      const result = await exportAndUploadBackup('daily')

      if (result.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Daily backup completed successfully',
            backupId: result.backupId,
            fileName: result.fileName,
            timestamp: new Date().toISOString(),
          }),
        }
      } else {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Daily backup failed',
            error: result.error,
          }),
        }
      }
    } else {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Method not allowed',
        }),
      }
    }
  } catch (error) {
    console.error('Backup API error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Backup failed',
        error: error.message || 'Unknown error',
      }),
    }
  }
}
