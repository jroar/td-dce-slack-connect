require("dotenv").config();
const getAccessToken = async () => {
    const scopes = [
        'digital-connect:write'
    ];

    const encodedCredentials = Buffer.from(`${process.env.TD_DCE_CLIENT_ID}:${process.env.TD_DCE_CLIENT_SECRET}`).toString('base64');
    const response = await fetch(`https://${process.env.TD_DCE_ACCOUNT_NAME}.talkdeskid.com/oauth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            Authorization: `Basic ${encodedCredentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            scope: scopes.join(' ')
        })
    });

    return (await response.json())['access_token'];
}

const createConversation = async (accessToken, touchpointId, contactPersonName, contactPersonEmail, previousMessages) => {
    const response = await fetch('https://api.talkdeskapp.com/digital-connect/conversations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'x-idempotency-key': Date.now().toString()
        },
        body:   JSON.stringify({
            "touchpoint_id": touchpointId,
            "subject": "Tesst",
            "contact_person": {
                "name": contactPersonName,
                "email": contactPersonEmail
            },
          
            "previous_messages":  previousMessages
        })
    });
    return response.json();
}

const sendMessage = async (accessToken, conversationId, message) => {
    const response = await fetch(`https://api.talkdeskapp.com/digital-connect/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'x-idempotency-key': Date.now().toString()
        },
        body:  JSON.stringify({
            "content": message
        })
    });
    return response.json();
}

async function test() {
    const accessToken = await getAccessToken();
    
    const response = await createConversation(accessToken, "19db026c-f922-44e1-9789-e3ea4bb84359", "Joao", "joao.pinto@emial.com", []);

    const message = await sendMessage(accessToken, response['id'], "Hello, how are you?");

    console.log(response);

    console.log(message);

}

//test();

module.exports = {
    getAccessToken,
    createConversation,
    sendMessage
};
