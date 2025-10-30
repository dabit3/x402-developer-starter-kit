import { randomBytes } from 'crypto';
import { Wallet } from 'ethers';
import dotenv from 'dotenv';
import type { PaymentPayload, PaymentRequirements } from 'x402/types';
import { Message, Task } from './x402Types.js';
import { CrossmintPayer } from './CrossmintPayer.js';

dotenv.config();

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3000';
const CLIENT_PRIVATE_KEY = process.env.CLIENT_PRIVATE_KEY;
const PAYER_MODE = process.env.PAYER_MODE?.toLowerCase() || 'eip3009';
const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY;
const CROSSMINT_OWNER = process.env.CROSSMINT_OWNER;
const CROSSMINT_CHAIN = process.env.CROSSMINT_CHAIN || process.env.NETWORK || 'base-sepolia';

interface AgentResponse {
  success?: boolean;
  task?: Task;
  events?: Task[];
  error?: string;
  x402?: any;
  settlement?: any;
}

const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  'base-sepolia': 84532,
  ethereum: 1,
  polygon: 137,
  'polygon-amoy': 80002,
};

function selectPaymentRequirement(paymentRequired: any): PaymentRequirements {
  const accepts = paymentRequired?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error('No payment requirements provided by the agent');
  }
  return accepts[0] as PaymentRequirements;
}

function generateNonce(): string {
  return `0x${randomBytes(32).toString('hex')}`;
}

function getChainId(network: string): number {
  const chainId = CHAIN_IDS[network];
  if (!chainId) {
    throw new Error(`Unsupported network "${network}"`);
  }
  return chainId;
}

async function createPaymentPayload(
  paymentRequired: any,
  wallet: Wallet
): Promise<PaymentPayload> {
  const requirement = selectPaymentRequirement(paymentRequired);

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from: wallet.address,
    to: requirement.payTo,
    value: requirement.maxAmountRequired,
    validAfter: '0',
    validBefore: String(now + requirement.maxTimeoutSeconds),
    nonce: generateNonce(),
  };

  const domain = {
    name: requirement.extra?.name || 'USDC',
    version: requirement.extra?.version || '2',
    chainId: getChainId(requirement.network),
    verifyingContract: requirement.asset,
  };

  const signature = await wallet.signTypedData(
    domain,
    TRANSFER_AUTH_TYPES,
    authorization
  );

  return {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      signature,
      authorization,
    },
  };
}

/**
 * Test client that can interact with the x402 AI agent
 * This demonstrates the complete payment flow
 */
export class TestClient {
  private wallet?: Wallet;
  private crossmintPayer?: CrossmintPayer;
  private agentUrl: string;
  private payerMode: string;

  constructor(privateKey?: string, agentUrl: string = AGENT_URL) {
    this.payerMode = PAYER_MODE;
    
    if (this.payerMode === 'crossmint') {
      console.log('🔐 Using Crossmint wallet for payments');
      if (!CROSSMINT_API_KEY || !CROSSMINT_OWNER) {
        console.warn('⚠️  CROSSMINT_API_KEY and CROSSMINT_OWNER required for Crossmint mode');
        console.warn('   Falling back to EIP-3009 mode');
        this.payerMode = 'eip3009';
      }
    }
    
    if (this.payerMode === 'eip3009' && privateKey) {
      this.wallet = new Wallet(privateKey);
      console.log(`💼 Client wallet (EIP-3009): ${this.wallet.address}`);
    }
    
    this.agentUrl = agentUrl;
  }

  /**
   * Send a request to the agent
   */
  async sendRequest(text: string): Promise<AgentResponse> {
    const message: Message = {
      messageId: `msg-${Date.now()}`,
      role: 'user',
      parts: [
        {
          kind: 'text',
          text: text,
        },
      ],
    };

    console.log(`\n📤 Sending request: "${text}"`);

    const response = await fetch(`${this.agentUrl}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json() as any;

    // Check for A2A-style payment requirement in task metadata
    if (data.task?.status?.message?.metadata?.['x402.payment.required']) {
      console.log('💳 Payment required (A2A style)!');
      return {
        error: 'Payment Required',
        x402: data.task.status.message.metadata['x402.payment.required'],
        task: data.task
      };
    }

    // Check for HTTP 402 style (legacy)
    if (response.status === 402) {
      console.log('💳 Payment required (HTTP 402)!');
      return { error: 'Payment Required', x402: data.x402 };
    }

    return data as AgentResponse;
  }

  /**
   * Initialize Crossmint payer if needed
   */
  private async initializeCrossmintPayer(): Promise<void> {
    if (this.payerMode === 'crossmint' && !this.crossmintPayer) {
      if (!CROSSMINT_API_KEY || !CROSSMINT_OWNER) {
        throw new Error('CROSSMINT_API_KEY and CROSSMINT_OWNER required for Crossmint mode');
      }
      
      this.crossmintPayer = new CrossmintPayer({
        apiKey: CROSSMINT_API_KEY,
        owner: CROSSMINT_OWNER,
        chain: CROSSMINT_CHAIN,
      });
      
      await this.crossmintPayer.initialize();
    }
  }

  /**
   * Send a paid request (with payment)
   */
  async sendPaidRequest(text: string): Promise<AgentResponse> {
    if (this.payerMode === 'crossmint') {
      await this.initializeCrossmintPayer();
      if (!this.crossmintPayer) {
        throw new Error('Failed to initialize Crossmint payer');
      }
    } else if (this.payerMode === 'eip3009') {
      if (!this.wallet) {
        throw new Error('Client wallet not configured. Set CLIENT_PRIVATE_KEY in .env');
      }
    } else {
      throw new Error(`Unknown payer mode: ${this.payerMode}`);
    }

    // Step 1: Send initial request
    console.log('\n=== STEP 1: Initial Request ===');
    const initialResponse = await this.sendRequest(text);

    if (!initialResponse.x402) {
      console.log('✅ Request processed without payment (unexpected)');
      return initialResponse;
    }

    // Step 2: Process payment requirement
    console.log('\n=== STEP 2: Processing Payment ===');
    const paymentRequired = initialResponse.x402;
    console.log(`Payment options: ${paymentRequired.accepts.length}`);
    console.log(`First option: ${paymentRequired.accepts[0].asset} on ${paymentRequired.accepts[0].network}`);
    console.log(`Amount: ${paymentRequired.accepts[0].maxAmountRequired} (micro units)`);

    try {
      let paymentPayload: PaymentPayload;
      
      if (this.payerMode === 'crossmint') {
        console.log('💳 Using Crossmint wallet for payment...');
        
        if (!CrossmintPayer.isCompatible(paymentRequired)) {
          console.error('❌ Merchant does not support direct-transfer scheme (required for Crossmint)');
          console.error('   Merchant must advertise scheme: "direct-transfer" to accept Crossmint payments');
          return {
            error: 'Merchant incompatible with Crossmint payments',
            x402: paymentRequired,
          };
        }
        
        const paymentResult = await this.crossmintPayer!.pay(paymentRequired);
        
        if (!paymentResult.success || !paymentResult.payload) {
          console.error(`❌ Crossmint payment failed: ${paymentResult.error}`);
          return {
            error: paymentResult.error || 'Crossmint payment failed',
            x402: paymentRequired,
          };
        }
        
        paymentPayload = paymentResult.payload;
        console.log('✅ Crossmint payment executed successfully');
        console.log(`   Transaction: ${paymentResult.transactionHash}`);
      } else {
        console.log('🔐 Signing EIP-3009 payment...');
        paymentPayload = await createPaymentPayload(paymentRequired, this.wallet!);
        console.log('✅ Payment signed successfully');
      }

      console.log(`Payment payload created for ${paymentPayload.network}`);

      // Step 3: Submit payment with original message
      console.log('\n=== STEP 3: Submitting Payment ===');

      // Use the taskId and contextId from the initial response if available
      const taskId = (initialResponse as any).task?.id || `task-${Date.now()}`;
      const contextId = (initialResponse as any).task?.contextId || `context-${Date.now()}`;

      // Create message with payment metadata embedded
      const message: Message = {
        messageId: `msg-${Date.now()}`,
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: text,
          },
        ],
        metadata: {
          'x402.payment.payload': paymentPayload,
          'x402.payment.status': 'payment-submitted',
        },
      };

      const paidResponse = await fetch(`${this.agentUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          taskId: taskId,
          contextId: contextId,
        }),
      });

      const paidData = await paidResponse.json() as any;

      if (paidResponse.ok) {
        console.log('✅ Payment accepted and request processed!');
        return paidData as AgentResponse;
      } else {
        console.log(`❌ Payment failed: ${paidData.error || 'Unknown error'}`);
        return paidData as AgentResponse;
      }
    } catch (error) {
      console.error('❌ Error processing payment:', error);
      throw error;
    }
  }

  /**
   * Check agent health
   */
  async checkHealth(): Promise<any> {
    console.log('\n🏥 Checking agent health...');
    const response = await fetch(`${this.agentUrl}/health`);
    const data = await response.json() as any;

    if (response.ok) {
      console.log('✅ Agent is healthy');
      console.log(`   Service: ${data.service}`);
      console.log(`   Payment address: ${data.payment.address}`);
      console.log(`   Network: ${data.payment.network}`);
      console.log(`   Price: ${data.payment.price}`);
    } else {
      console.log('❌ Agent is not healthy');
    }

    return data;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 x402 AI Agent Test Client');
  console.log('================================\n');

  const client = new TestClient(CLIENT_PRIVATE_KEY);

  // Check agent health
  await client.checkHealth();

  // Test 1: Request without payment
  console.log('\n\n📋 TEST 1: Request without payment');
  console.log('=====================================');
  try {
    const response = await client.sendRequest('What is 2+2?');
    if (response.x402) {
      console.log('✅ Correctly received payment requirement');
    } else {
      console.log('❌ Expected payment requirement');
    }
  } catch (error) {
    console.error('❌ Test 1 failed:', error);
  }

  // Test 2: Request with payment (only if wallet configured)
  const hasEIP3009Wallet = CLIENT_PRIVATE_KEY && PAYER_MODE === 'eip3009';
  const hasCrossmintWallet = CROSSMINT_API_KEY && CROSSMINT_OWNER && PAYER_MODE === 'crossmint';
  
  if (hasEIP3009Wallet || hasCrossmintWallet) {
    console.log('\n\n📋 TEST 2: Request with payment');
    console.log('=====================================');
    console.log(`Payment mode: ${PAYER_MODE}`);
    
    try {
      const response = await client.sendPaidRequest('Tell me a joke about TypeScript!');

      if (response.success && response.task) {
        console.log('\n🎉 SUCCESS! Response from AI:');
        console.log('-----------------------------------');
        const aiResponse = response.task.status.message?.parts
          ?.filter((p: any) => p.kind === 'text')
          .map((p: any) => p.text)
          .join(' ');
        console.log(aiResponse);
        console.log('-----------------------------------');
      } else {
        console.log('❌ Request failed:', response.error);
      }
    } catch (error) {
      console.error('❌ Test 2 failed:', error);
    }
  } else {
    console.log('\n\n⚠️  TEST 2: Skipped (no payment wallet configured)');
    console.log('=====================================');
    console.log('To test with payment, choose one of:');
    console.log('\n1. EIP-3009 mode (traditional wallet):');
    console.log('   - Set CLIENT_PRIVATE_KEY in .env');
    console.log('   - Set PAYER_MODE=eip3009 (or leave unset)');
    console.log('   - Wallet needs USDC tokens and ETH for gas');
    console.log('\n2. Crossmint mode (smart wallet):');
    console.log('   - Set PAYER_MODE=crossmint in .env');
    console.log('   - Set CROSSMINT_API_KEY in .env');
    console.log('   - Set CROSSMINT_OWNER (e.g., email:agent@yourdomain.com)');
    console.log('   - Note: Only works with merchants that support "direct-transfer" scheme');
  }

  console.log('\n\n✅ Tests complete!');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main as runTests };
