// TdDceClient.js - Talkdesk Digital Connect Client with Idempotency Support
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Cache token to avoid repeated auth calls
let cachedToken = null;
let tokenExpiry = null;
let tokenRefreshPromise = null; // Prevent concurrent refresh attempts
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiry

// Generate unique idempotency key
function generateIdempotencyKey() {
    return crypto.randomUUID();
}

async function getAccessToken(forceRefresh = false) {
    const now = Date.now();
    
    // Check if we have a valid cached token (with buffer time)
    if (!forceRefresh && cachedToken && tokenExpiry && now < (tokenExpiry - TOKEN_REFRESH_BUFFER)) {
        return cachedToken;
    }

    // If a refresh is already in progress, wait for it
    if (tokenRefreshPromise) {
        return tokenRefreshPromise;
    }

    // Start a new refresh
    tokenRefreshPromise = (async () => {
        try {
            // Determine the OAuth URL based on your region
            // US: https://us.talkdeskid.com/oauth/token
            // EU: https://eu.talkdeskid.com/oauth/token
            const tokenUrl = process.env.TD_DCE_TOKEN_URL || 'https://us.talkdeskid.com/oauth/token';
            
            console.log('Getting new access token from:', tokenUrl);
            
            // Base64 encode client_id:client_secret
            const credentials = Buffer.from(
                `${process.env.TD_DCE_CLIENT_ID}:${process.env.TD_DCE_CLIENT_SECRET}`
            ).toString('base64');

            const response = await axios.post(tokenUrl, 
                new URLSearchParams({
                    grant_type: 'client_credentials'
                }),
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            // Use expires_in from response if available, otherwise default to 1 hour
            const expiresIn = response.data.expires_in || 3600; // Default to 1 hour in seconds
            const expiresInMs = expiresIn * 1000; // Convert to milliseconds
            
            // Cache the token with buffer time
            cachedToken = response.data.access_token;
            tokenExpiry = Date.now() + expiresInMs;
            
            console.log(`✓ Access token obtained successfully (expires in ${expiresIn}s)`);
            return cachedToken;
            
        } catch (error) {
            console.error('❌ Failed to get access token:', error.response?.data || error.message);
            // Clear cached token on error
            cachedToken = null;
            tokenExpiry = null;
            throw error;
        } finally {
            // Clear the refresh promise so future calls can refresh again
            tokenRefreshPromise = null;
        }
    })();

    return tokenRefreshPromise;
}

// Helper function to make API calls with automatic token refresh on 401
async function makeAuthenticatedRequest(requestFn, providedToken = null, retries = 1) {
    // Use provided token if available, otherwise get a fresh one
    let accessToken = providedToken || await getAccessToken();
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await requestFn(accessToken);
        } catch (error) {
            // If we get a 401 and have retries left, refresh token and retry
            if (error.response?.status === 401 && attempt < retries) {
                console.log('Got 401 error, refreshing token and retrying...');
                accessToken = await getAccessToken(true); // Force refresh
                continue; // Retry with new token
            }
            // Otherwise, throw the error
            throw error;
        }
    }
}

async function createConversation(accessToken, touchpointId, email, metadata) {
    const apiUrl = process.env.TD_DCE_API_BASE_URL || 'https://api.talkdeskdce.com';
    const idempotencyKey = generateIdempotencyKey();
    
    console.log('Creating conversation for email:', email);
    console.log('Idempotency key:', idempotencyKey);
    
    const requestBody = {
        touchpoint_id: touchpointId,
        contact_person: {
            email: email,
        },
        metadata: metadata || {},
        // Some Talkdesk configurations might require additional fields
        channel: 'api',
        source: 'middleware'
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    return makeAuthenticatedRequest(async (token) => {
        const response = await axios.post(
            `${apiUrl}/digital-connect/conversations`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': idempotencyKey,
                    // Add account header if required
                    ...(process.env.TD_DCE_ACCOUNT_NAME && {
                        'X-Account-Name': process.env.TD_DCE_ACCOUNT_NAME
                    })
                }
            }
        );

        console.log('✓ Conversation created:', response.data.id);
        return response.data;
    }, accessToken);
}

async function sendMessage(accessToken, conversationId, message) {
    const apiUrl = process.env.TD_DCE_API_BASE_URL || 'https://api.talkdeskdce.com';
    const idempotencyKey = generateIdempotencyKey();
    
    console.log(`Sending message to conversation ${conversationId}: "${message}"`);
    console.log('Idempotency key:', idempotencyKey);
    
    const requestBody = {
        content: message,
        type: 'text',
        direction: 'inbound', // Messages from user are inbound
        // Add timestamp
        timestamp: new Date().toISOString()
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    try {
        const result = await makeAuthenticatedRequest(async (token) => {
            const response = await axios.post(
                `${apiUrl}/digital-connect/conversations/${conversationId}/messages`,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': idempotencyKey,
                        // Add account header if required
                        ...(process.env.TD_DCE_ACCOUNT_NAME && {
                            'X-Account-Name': process.env.TD_DCE_ACCOUNT_NAME
                        })
                    }
                }
            );

            console.log('✓ Message sent successfully');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return response.data;
        }, accessToken);

        return result;
        
    } catch (error) {
        console.error('❌ Failed to send message:', error.response?.data || error.message);
        
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            
            // Check for specific error codes
            if (error.response?.data?.code === '3016011') {
                console.log('Conversation has ended on DCE side');
            }
        }
        
        return error.response?.data || { error: error.message };
    }
}

// Optional: Function to send a message with a specific idempotency key
// Useful for retries
async function sendMessageWithIdempotency(accessToken, conversationId, message, idempotencyKey) {
    const apiUrl = process.env.TD_DCE_API_BASE_URL || 'https://api.talkdeskdce.com';
    
    console.log(`Sending message with specific idempotency key: ${idempotencyKey}`);
    
    try {
        return await makeAuthenticatedRequest(async (token) => {
            const response = await axios.post(
                `${apiUrl}/digital-connect/conversations/${conversationId}/messages`,
                {
                    content: message,
                    type: 'text',
                    direction: 'inbound',
                    timestamp: new Date().toISOString()
                },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': idempotencyKey,
                        ...(process.env.TD_DCE_ACCOUNT_NAME && {
                            'X-Account-Name': process.env.TD_DCE_ACCOUNT_NAME
                        })
                    }
                }
            );

            return response.data;
        }, accessToken);
        
    } catch (error) {
        // If we get a 409 Conflict, it means the message was already processed
        if (error.response?.status === 409) {
            console.log('Message already processed (idempotency key match)');
            return { status: 'already_processed', idempotencyKey };
        }
        throw error;
    }
}

// Test function to verify headers being sent
async function testHeaders() {
    console.log('\n=== Testing Headers Configuration ===');
    console.log('Account Name:', process.env.TD_DCE_ACCOUNT_NAME || 'NOT SET');
    console.log('API Base URL:', process.env.TD_DCE_API_BASE_URL || 'https://api.talkdeskdce.com');
    console.log('Token URL:', process.env.TD_DCE_TOKEN_URL || 'https://us.talkdeskid.com/oauth/token');
    
    const testIdempotencyKey = generateIdempotencyKey();
    console.log('Sample Idempotency Key:', testIdempotencyKey);
    
    console.log('\nHeaders that will be sent:');
    console.log('- Authorization: Bearer [TOKEN]');
    console.log('- Content-Type: application/json');
    console.log('- X-Idempotency-Key:', testIdempotencyKey);
    if (process.env.TD_DCE_ACCOUNT_NAME) {
        console.log('- X-Account-Name:', process.env.TD_DCE_ACCOUNT_NAME);
    }
    console.log('=====================================\n');
}

module.exports = {
    getAccessToken,
    createConversation,
    sendMessage,
    sendMessageWithIdempotency,
    generateIdempotencyKey,
    testHeaders
};
