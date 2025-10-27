import { Wallet } from 'ethers';
import { processPaymentRequired } from 'a2a-x402';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;
const NETWORK = process.env.NETWORK || 'base-sepolia';

async function testFacilitator() {
  console.log('🧪 Testing Facilitator Communication');
  console.log('====================================\n');

  if (!CLIENT_PRIVATE_KEY) {
    console.error('❌ CLIENT_PRIVATE_KEY not set');
    return;
  }

  const wallet = new Wallet(CLIENT_PRIVATE_KEY);
  console.log(`💼 Client wallet: ${wallet.address}`);
  console.log(`💰 Merchant wallet: ${PAY_TO_ADDRESS}`);
  console.log(`🌐 Network: ${NETWORK}\n`);

  // Create a payment requirement
  const paymentRequired = {
    x402Version: 1,
    accepts: [{
      scheme: 'exact',
      network: NETWORK,
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
      payTo: PAY_TO_ADDRESS,
      maxAmountRequired: '100000', // $0.10
      resource: '/test-resource',
      description: 'Test payment',
      mimeType: 'application/json',
      maxTimeoutSeconds: 600,
      extra: {
        name: 'USDC',
        version: '2',
      },
    }],
    error: 'Payment required',
  };

  console.log('📝 Payment requirements:');
  console.log(JSON.stringify(paymentRequired, null, 2));

  // Sign the payment
  console.log('\n🔐 Signing payment...');
  const paymentPayload = await processPaymentRequired(paymentRequired, wallet);

  console.log('\n✅ Payment signed!');
  console.log('Payment payload:');
  console.log(JSON.stringify(paymentPayload, null, 2));

  // Try to verify with the facilitator
  console.log('\n📡 Sending verification request to facilitator...');
  console.log('URL: https://x402.org/facilitator/verify\n');

  try {
    const verifyResponse = await fetch('https://x402.org/facilitator/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: paymentPayload,
        requirements: paymentRequired.accepts[0],
      }),
    });

    console.log(`Response status: ${verifyResponse.status} ${verifyResponse.statusText}`);

    const responseText = await verifyResponse.text();
    console.log('\nResponse body:');
    console.log(responseText);

    if (verifyResponse.ok) {
      try {
        const data = JSON.parse(responseText);
        console.log('\n✅ Parsed response:');
        console.log(JSON.stringify(data, null, 2));
      } catch (e) {
        // Response is not JSON
      }
    } else {
      console.log('\n❌ Facilitator returned an error');

      // Try to parse error details
      try {
        const errorData = JSON.parse(responseText);
        console.log('\nError details:');
        console.log(JSON.stringify(errorData, null, 2));
      } catch (e) {
        console.log('\nRaw error response (not JSON):');
        console.log(responseText);
      }
    }

  } catch (error) {
    console.error('\n❌ Error communicating with facilitator:', error);
  }

  // Also try the settle endpoint to see its format
  console.log('\n\n📡 Testing settle endpoint...');
  console.log('URL: https://x402.org/facilitator/settle\n');

  try {
    const settleResponse = await fetch('https://x402.org/facilitator/settle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: paymentPayload,
        requirements: paymentRequired.accepts[0],
      }),
    });

    console.log(`Response status: ${settleResponse.status} ${settleResponse.statusText}`);

    const responseText = await settleResponse.text();
    console.log('\nResponse body:');
    console.log(responseText);

  } catch (error) {
    console.error('\n❌ Error communicating with facilitator:', error);
  }
}

testFacilitator().catch(console.error);
