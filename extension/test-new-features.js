/**
 * Test script for new features: Multi-Send, Payment Requests, Webhooks
 * 
 * Usage: Paste this into the Extension Service Worker DevTools Console
 * (chrome://extensions → Nebula Wallet → Service Worker → Inspect)
 */

async function testNewFeatures() {
  const send = (type, payload) => new Promise(resolve => 
    chrome.runtime.sendMessage({ type, payload }, resolve)
  );

  console.log('=== Testing New Features ===\n');

  // 1. Test Webhook Registration
  console.log('1. Registering test webhook...');
  const webhookResult = await send('REGISTER_WEBHOOK', {
    url: 'https://httpbin.org/post',
    events: ['trigger_fired', 'action_executed']
  });
  console.log('   Result:', webhookResult.success ? '✅' : '❌', webhookResult);

  // 2. Test Webhook
  console.log('\n2. Testing webhook...');
  const testResult = await send('TEST_WEBHOOK', {
    url: 'https://httpbin.org/post'
  });
  console.log('   Result:', testResult.success ? '✅' : '❌', testResult);

  // 3. List Webhooks
  console.log('\n3. Listing webhooks...');
  const listResult = await send('GET_WEBHOOKS');
  console.log('   Webhooks:', listResult.data?.webhooks?.length || 0);

  // 4. Create Payment Request (will fail if no second address)
  console.log('\n4. Creating payment request...');
  const reqResult = await send('CREATE_PAYMENT_REQUEST', {
    requestedFrom: 'GDUMMY_ADDRESS_FOR_TESTING_PURPOSES_ONLY',
    amount: '5',
    memo: 'Test request'
  });
  console.log('   Result:', reqResult.success ? '✅' : '❌', reqResult);

  // 5. Get Payment Requests
  console.log('\n5. Getting payment requests...');
  const requests = await send('GET_PAYMENT_REQUESTS');
  console.log('   Incoming:', requests.data?.incoming?.length || 0);
  console.log('   Outgoing:', requests.data?.outgoing?.length || 0);

  console.log('\n=== Tests Complete ===');
  console.log('\nNext steps:');
  console.log('1. Test Multi-Send: Use EXECUTE_MULTI_SEND with recipients array');
  console.log('2. Test in Agent Builder: Drag Multi-Send and Webhook blocks from palette');
  console.log('3. Test Payment Request flow with two different accounts');
}

// Auto-run
testNewFeatures();
