const { getLastBackupTime, isBackupNeeded } = require('../../lib/backupService')

exports.handler = async (event, context) => {
  // Set headers for CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Method not allowed',
      }),
    }
  }

  try {
    const lastBackupTime = await getLastBackupTime()
    const needsBackup = await isBackupNeeded()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        lastBackupTime: lastBackupTime ? lastBackupTime.toISOString() : null,
        needsBackup,
        hoursSinceLastBackup: lastBackupTime
          ? Math.round((Date.now() - lastBackupTime.getTime()) / (1000 * 60 * 60) * 10) / 10
          : null,
      }),
    }
  } catch (error) {
    console.error('Backup status API error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Unknown error',
      }),
    }
  }
}
