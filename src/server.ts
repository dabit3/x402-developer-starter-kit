import express from 'express';
import dotenv from 'dotenv';
import { ExampleService } from './ExampleService.js';
import { MerchantExecutor, type MerchantExecutorOptions } from './MerchantExecutor.js';
import { CrossmintPayer } from './CrossmintPayer.js';
import { OutboundX402Client } from './OutboundX402Client.js';
import type { Network, PaymentPayload } from 'x402/types';
import {
  EventQueue,
  Message,
  RequestContext,
  Task,
  TaskState,
} from './x402Types.js';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;
const NETWORK = process.env.NETWORK || 'base-sepolia';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FACILITATOR_URL = process.env.FACILITATOR_URL;
const FACILITATOR_API_KEY = process.env.FACILITATOR_API_KEY;
const SERVICE_URL =
  process.env.SERVICE_URL || `http://localhost:${PORT}/process`;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL;
const SETTLEMENT_MODE_ENV = process.env.SETTLEMENT_MODE?.toLowerCase();
const ASSET_ADDRESS = process.env.ASSET_ADDRESS;
const ASSET_NAME = process.env.ASSET_NAME;
const EXPLORER_URL = process.env.EXPLORER_URL;
const CHAIN_ID = process.env.CHAIN_ID
  ? Number.parseInt(process.env.CHAIN_ID, 10)
  : undefined;
const AI_PROVIDER = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const EIGENAI_BASE_URL =
  process.env.EIGENAI_BASE_URL || 'https://eigenai.eigencloud.xyz/v1';
const EIGENAI_API_KEY = process.env.EIGENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL;
const AI_TEMPERATURE = process.env.AI_TEMPERATURE
  ? Number.parseFloat(process.env.AI_TEMPERATURE)
  : undefined;
const AI_MAX_TOKENS = process.env.AI_MAX_TOKENS
  ? Number.parseInt(process.env.AI_MAX_TOKENS, 10)
  : undefined;
const AI_SEED = process.env.AI_SEED
  ? Number.parseInt(process.env.AI_SEED, 10)
  : undefined;
const PAYER_MODE = process.env.PAYER_MODE?.toLowerCase() || 'none';
const CROSSMINT_API_KEY = process.env.CROSSMINT_API_KEY;
const CROSSMINT_OWNER = process.env.CROSSMINT_OWNER;
const CROSSMINT_CHAIN = process.env.CROSSMINT_CHAIN || NETWORK;
const UPSTREAM_X402_URL = process.env.UPSTREAM_X402_URL;
const SUPPORTED_NETWORKS: Network[] = [
  'base',
  'base-sepolia',
  'polygon',
  'polygon-amoy',
  'avalanche',
  'avalanche-fuji',
  'iotex',
  'sei',
  'sei-testnet',
  'peaq',
  'solana',
  'solana-devnet',
];

// Validate environment variables
if (AI_PROVIDER === 'openai') {
  if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required when AI_PROVIDER=openai');
    process.exit(1);
  }
} else if (AI_PROVIDER === 'eigenai') {
  if (!EIGENAI_API_KEY && !OPENAI_API_KEY) {
    console.error('❌ EIGENAI_API_KEY (or OPENAI_API_KEY fallback) is required when AI_PROVIDER=eigenai');
    process.exit(1);
  }
} else {
  console.error(
    `❌ AI_PROVIDER "${AI_PROVIDER}" is not supported. Supported providers: openai, eigenai`
  );
  process.exit(1);
}

if (!PAY_TO_ADDRESS) {
  console.error('❌ PAY_TO_ADDRESS is required');
  process.exit(1);
}

if (!SUPPORTED_NETWORKS.includes(NETWORK as Network)) {
  console.error(
    `❌ NETWORK "${NETWORK}" is not supported. Supported networks: ${SUPPORTED_NETWORKS.join(
      ', '
    )}`
  );
  process.exit(1);
}

const resolvedNetwork = NETWORK as Network;

let settlementMode: 'facilitator' | 'direct';
if (SETTLEMENT_MODE_ENV === 'local' || SETTLEMENT_MODE_ENV === 'direct') {
  settlementMode = 'direct';
} else if (SETTLEMENT_MODE_ENV === 'facilitator') {
  settlementMode = 'facilitator';
} else if (FACILITATOR_URL) {
  settlementMode = 'facilitator';
} else if (PRIVATE_KEY) {
  settlementMode = 'direct';
} else {
  settlementMode = 'facilitator';
}

if (settlementMode === 'direct' && !PRIVATE_KEY) {
  console.error('❌ SETTLEMENT_MODE=local requires PRIVATE_KEY to be configured');
  process.exit(1);
}

const exampleService = new ExampleService({
  provider: AI_PROVIDER === 'eigenai' ? 'eigenai' : 'openai',
  apiKey: AI_PROVIDER === 'openai' ? OPENAI_API_KEY : undefined,
  baseUrl:
    AI_PROVIDER === 'eigenai'
      ? EIGENAI_BASE_URL
      : OPENAI_BASE_URL || undefined,
  defaultHeaders:
    AI_PROVIDER === 'eigenai'
      ? { 'x-api-key': (EIGENAI_API_KEY || OPENAI_API_KEY)! }
      : undefined,
  payToAddress: PAY_TO_ADDRESS,
  network: resolvedNetwork,
  model:
    AI_MODEL ??
    (AI_PROVIDER === 'eigenai' ? 'gpt-oss-120b-f16' : 'gpt-4o-mini'),
  temperature: AI_TEMPERATURE ?? 0.7,
  maxTokens: AI_MAX_TOKENS ?? 500,
  seed: AI_PROVIDER === 'eigenai' ? AI_SEED : undefined,
});

// Initialize the example service (replace with your own service)
const merchantOptions: MerchantExecutorOptions = {
  payToAddress: PAY_TO_ADDRESS,
  network: resolvedNetwork,
  price: 0.1,
  facilitatorUrl: FACILITATOR_URL,
  facilitatorApiKey: FACILITATOR_API_KEY,
  resourceUrl: SERVICE_URL,
  settlementMode,
  rpcUrl: RPC_URL,
  privateKey: PRIVATE_KEY,
  assetAddress: ASSET_ADDRESS,
  assetName: ASSET_NAME,
  explorerUrl: EXPLORER_URL,
  chainId: CHAIN_ID,
};

const merchantExecutor = new MerchantExecutor(merchantOptions);

let outboundClient: OutboundX402Client | undefined;
let crossmintWalletAddress: string | undefined;

async function initializeCrossmintWallet() {
  if (PAYER_MODE === 'crossmint') {
    if (!CROSSMINT_API_KEY || !CROSSMINT_OWNER) {
      console.error('❌ PAYER_MODE=crossmint requires CROSSMINT_API_KEY and CROSSMINT_OWNER');
      process.exit(1);
    }

    console.log('🔐 Initializing Crossmint wallet for outbound payments...');
    const crossmintPayer = new CrossmintPayer({
      apiKey: CROSSMINT_API_KEY,
      owner: CROSSMINT_OWNER,
      chain: CROSSMINT_CHAIN,
    });

    await crossmintPayer.initialize();
    crossmintWalletAddress = crossmintPayer.getAddress();

    outboundClient = new OutboundX402Client({
      crossmintPayer,
    });

    console.log('✅ Crossmint wallet initialized for agent');
    console.log(`   Wallet address: ${crossmintWalletAddress}`);
    console.log(`   Chain: ${CROSSMINT_CHAIN}`);
    if (UPSTREAM_X402_URL) {
      console.log(`   Upstream service: ${UPSTREAM_X402_URL}`);
    }
  }
}

if (settlementMode === 'direct') {
  console.log('🧩 Using local settlement (direct EIP-3009 via RPC)');
  if (RPC_URL) {
    console.log(`🔌 RPC endpoint: ${RPC_URL}`);
  } else {
    console.log('🔌 RPC endpoint: using default for selected network');
  }
} else if (FACILITATOR_URL) {
  console.log(`🌐 Using custom facilitator: ${FACILITATOR_URL}`);
} else {
  console.log('🌐 Using default facilitator: https://x402.org/facilitator');
}

console.log('🚀 x402 Payment API initialized');
console.log(`💰 Payment address: ${PAY_TO_ADDRESS}`);
console.log(`🌐 Network: ${resolvedNetwork}`);
console.log(`💵 Price per request: $0.10 USDC`);

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const response: any = {
    status: 'healthy',
    service: 'x402-payment-api',
    version: '1.0.0',
    payment: {
      address: PAY_TO_ADDRESS,
      network: NETWORK,
      price: '$0.10',
    },
  };

  if (crossmintWalletAddress) {
    response.crossmintWallet = {
      address: crossmintWalletAddress,
      chain: CROSSMINT_CHAIN,
      mode: 'outbound-payer',
    };
  }

  res.json(response);
});

/**
 * Main endpoint to process paid requests
 * This endpoint accepts A2A-compatible task submissions with x402 payments
 */
app.post('/process', async (req, res) => {
  try {
    console.log('\n📥 Received request');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    // Parse the incoming request
    const { message, taskId, contextId, metadata } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Missing message in request body',
      });
    }

    // Create a task from the request
    const task: Task = {
      id: taskId || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      contextId: contextId || `context-${Date.now()}`,
      status: {
        state: TaskState.INPUT_REQUIRED,
        message: message,
      },
      metadata: metadata || {},
    };

    // Create request context
    const context: RequestContext = {
      taskId: task.id,
      contextId: task.contextId,
      currentTask: task,
      message: message,
    };

    // Create event queue to collect responses
    const events: Task[] = [];
    const eventQueue: EventQueue = {
      enqueueEvent: async (event: Task) => {
        events.push(event);
      },
    };

    const paymentPayload = message.metadata?.['x402.payment.payload'] as
      | PaymentPayload
      | undefined;
    const paymentStatus = message.metadata?.['x402.payment.status'];

    if (!paymentPayload || paymentStatus !== 'payment-submitted') {
      const paymentRequired = merchantExecutor.createPaymentRequiredResponse();

      const responseMessage: Message = {
        messageId: `msg-${Date.now()}`,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: 'Payment required. Please submit payment to continue.',
          },
        ],
        metadata: {
          'x402.payment.required': paymentRequired,
          'x402.payment.status': 'payment-required',
        },
      };

      task.status.state = TaskState.INPUT_REQUIRED;
      task.status.message = responseMessage;
      task.metadata = {
        ...(task.metadata || {}),
        'x402.payment.required': paymentRequired,
        'x402.payment.status': 'payment-required',
      };

      events.push(task);
      console.log('💰 Payment required for request processing');

      return res.json({
        success: false,
        error: 'Payment Required',
        task,
        events,
      });
    }

    const verifyResult = await merchantExecutor.verifyPayment(paymentPayload);

    if (!verifyResult.isValid) {
      const errorReason = verifyResult.invalidReason || 'Invalid payment';
      task.status.state = TaskState.FAILED;
      task.status.message = {
        messageId: `msg-${Date.now()}`,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Payment verification failed: ${errorReason}`,
          },
        ],
        metadata: {
          'x402.payment.status': 'payment-rejected',
          'x402.payment.error': errorReason,
        },
      };
      task.metadata = {
        ...(task.metadata || {}),
        'x402.payment.status': 'payment-rejected',
        'x402.payment.error': errorReason,
      };

      events.push(task);

      return res.status(402).json({
        error: 'Payment verification failed',
        reason: errorReason,
        task,
        events,
      });
    }

    task.metadata = {
      ...(task.metadata || {}),
      'x402_payment_verified': true,
      'x402.payment.status': 'payment-verified',
      ...(verifyResult.payer ? { 'x402.payment.payer': verifyResult.payer } : {}),
    };

    await exampleService.execute(context, eventQueue);

    const settlement = await merchantExecutor.settlePayment(paymentPayload);

    task.metadata = {
      ...(task.metadata || {}),
      'x402.payment.status': settlement.success ? 'payment-completed' : 'payment-failed',
      ...(settlement.transaction
        ? { 'x402.payment.receipts': [settlement] }
        : {}),
      ...(settlement.errorReason
        ? { 'x402.payment.error': settlement.errorReason }
        : {}),
    };

    if (events.length === 0) {
      events.push(task);
    }

    console.log('📤 Sending response\n');

    return res.json({
      success: settlement.success,
      task: events[events.length - 1],
      events,
      settlement,
    });
  } catch (error: any) {
    console.error('❌ Error processing request:', error);

    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

/**
 * Simple test endpoint to try the agent
 */
app.post('/test', async (req, res) => {
  const message: Message = {
    messageId: `msg-${Date.now()}`,
    role: 'user',
    parts: [
      {
        kind: 'text',
        text: req.body.text || 'Hello, tell me a joke!',
      },
    ],
  };

  try {
    const response = await fetch(`http://localhost:${PORT}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

/**
 * Proxy endpoint - demonstrates agent making payments to other x402 services
 * This endpoint uses the agent's Crossmint wallet to pay for upstream services
 */
app.post('/proxy', async (req, res) => {
  if (!outboundClient) {
    return res.status(400).json({
      error: 'Crossmint wallet not configured. Set PAYER_MODE=crossmint and configure CROSSMINT_API_KEY, CROSSMINT_OWNER',
    });
  }

  if (!UPSTREAM_X402_URL) {
    return res.status(400).json({
      error: 'UPSTREAM_X402_URL not configured. Set this to the URL of the x402 service you want to call',
    });
  }

  const text = req.body.text || 'Hello from the agent!';

  try {
    console.log('\n🔗 Agent making outbound payment to upstream x402 service...');
    const result = await outboundClient.callPaidApi(UPSTREAM_X402_URL, text);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Payment successful and request processed',
        data: result.data,
        agentWallet: crossmintWalletAddress,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error,
        agentWallet: crossmintWalletAddress,
      });
    }
  } catch (error: any) {
    console.error('❌ Error in proxy endpoint:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error',
    });
  }
});

// Start the server
async function startServer() {
  await initializeCrossmintWallet();
  
  app.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log(`📖 Health check: http://localhost:${PORT}/health`);
    console.log(`🧪 Test endpoint: POST http://localhost:${PORT}/test`);
    console.log(`🚀 Main endpoint: POST http://localhost:${PORT}/process`);
    if (outboundClient) {
      console.log(`🔗 Proxy endpoint: POST http://localhost:${PORT}/proxy (agent makes payments with Crossmint wallet)`);
    }
    console.log('');
  });
}

startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
