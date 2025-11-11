![x402 Starter Kit](header.jpg)

# x402 Starter Kit

A starter kit for building paid APIs using the x402 payment protocol.

## Overview

This starter kit demonstrates how to build paid APIs using x402. It:

1. Receives API requests
2. Requires payment (in this example of $0.10 USDC) before processing
3. Verifies and settles payments through the x402 facilitator (defaulting to [https://x402.org/facilitator](https://docs.cdp.coinbase.com/x402/network-support#x402-org-facilitator))
4. Processes requests (using OpenAI/EigenAI as configurable examples)
5. Returns responses after payment is confirmed

## Architecture

The API consists of three main components:

- **ExampleService**: Example service logic that processes requests using OpenAI or EigenAI (replace with your own service implementation)
- **MerchantExecutor**: Calls the x402 facilitator service for verification/settlement (defaults to `https://x402.org/facilitator`, configurable via `FACILITATOR_URL`)
- **Server**: Express HTTP server that orchestrates payment validation and request processing

## Prerequisites

- Node.js 18 or higher
- A wallet with some ETH for gas fees (on your chosen network)
- An OpenAI or EigenAI API key (for the example implementation - replace with your own API)
- A wallet address to receive USDC payments
- Optional: to deploy to EigenCompute (for Verifiable Runtime), follow [these steps](DEPLOYING_TO_TEE.md). To sign up for EigenAI (for Verifiable Inference), start [here](https://docs.eigencloud.xyz/products/eigenai/eigenai-overview)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
# Server Configuration
PORT=3000

# Payment Configuration
# Wallet address that will receive USDC payments
PAY_TO_ADDRESS=0xYourWalletAddress

# Network Configuration
# Built-in options: "base", "base-sepolia", "polygon", "polygon-amoy", "avalanche",
# "avalanche-fuji", "iotex", "sei", "sei-testnet", "peaq", "solana", "solana-devnet"
# For a custom network, set NETWORK to an identifier of your choice and provide
# ASSET_ADDRESS, ASSET_NAME, and (for EVM networks) CHAIN_ID. Direct settlement is
# available on EVM networks only.
NETWORK=base-sepolia

# OpenAI Configuration
# Your OpenAI API key for the example service (replace with your own API configuration)
OPENAI_API_KEY=your_openai_api_key_here
# Optional: override the OpenAI base URL
# OPENAI_BASE_URL=https://api.openai.com/v1

# AI Provider Configuration (default is openai)
# Options: "openai" or "eigenai"
# AI_PROVIDER=eigenai
# AI_MODEL=gpt-oss-120b-f16
# AI_TEMPERATURE=0.7
# AI_MAX_TOKENS=500
# AI_SEED=42

# EigenAI Configuration (required if AI_PROVIDER=eigenai)
# EIGENAI_API_KEY=your_eigenai_api_key_here
# EIGENAI_BASE_URL=https://eigenai.eigencloud.xyz/v1

# Facilitator Configuration (optional)
# FACILITATOR_URL=https://your-custom-facilitator.com
# FACILITATOR_API_KEY=your_api_key_if_required

# Local Settlement (optional)
# SETTLEMENT_MODE=local
# PRIVATE_KEY=your_private_key_here
# RPC_URL=https://base-sepolia.g.alchemy.com/v2/your-api-key

# Custom Network Details (required if NETWORK is not base/base-sepolia/polygon/polygon-amoy)
# ASSET_ADDRESS=0xTokenAddress
# ASSET_NAME=USDC
# EXPLORER_URL=https://explorer.your-network.org
# CHAIN_ID=84532

# Public Service URL (optional)
# Used in payment requirements so the facilitator sees a fully-qualified resource URL
# SERVICE_URL=http://localhost:3000/process

# Test Client Configuration (optional - only needed for end-to-end payment testing)
# CLIENT_PRIVATE_KEY=your_test_wallet_private_key_here
# AGENT_URL=http://localhost:3000

# Optional: Debug logging
X402_DEBUG=true
```

## Quickstart

1. **Run the API**
   ```bash
   npm run dev
   ```
2. **Run the test suite (in another terminal)**
   ```bash
   npm test
   ```

**Settlement Modes:**
- Default: no extra config, uses the hosted facilitator at `https://x402.org/facilitator`
- Local (direct): set `SETTLEMENT_MODE=local`, provide `PRIVATE_KEY`, and optionally override `RPC_URL` for your network
- Custom facilitator: set `FACILITATOR_URL` (and `FACILITATOR_API_KEY` if needed) to call a different facilitator endpoint (e.g., one you host yourself)
- Update `SERVICE_URL` if clients reach your API through a different hostname so the payment requirement has a fully-qualified resource URL
- If you set `NETWORK` to something other than `base`, `base-sepolia`, `polygon`, or `polygon-amoy`, provide `ASSET_ADDRESS`, `ASSET_NAME`, and (for local settlement) `CHAIN_ID`

**AI Provider:**
- Default: `AI_PROVIDER=openai` (requires `OPENAI_API_KEY`)
- EigenAI: set `AI_PROVIDER=eigenai`, provide `EIGENAI_API_KEY`, and optionally override `EIGENAI_BASE_URL`
- Use `AI_MODEL`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`, and `AI_SEED` to tune inference behaviour for either provider

**Important:**
- `PAY_TO_ADDRESS` should be your wallet address where you want to receive USDC payments
- `NETWORK` should match where you want to receive payments (recommend `base-sepolia` for testing)
- `OPENAI_API_KEY` is required unless `AI_PROVIDER=eigenai` (then provide `EIGENAI_API_KEY`)
- Never commit your `.env` file to version control

## Running the API

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

The server will start on `http://localhost:3000` (or your configured PORT).

### Docker

```bash
# Build the image
docker build -t x402-starter .

# Run the container (make sure .env has the required variables)
docker run --env-file .env -p 3000:3000 x402-starter
```

## Usage

### Health Check

Check if the API is running:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "service": "x402-payment-api",
  "version": "1.0.0",
  "payment": {
    "address": "0xYourAddress...",
    "network": "base-sepolia",
    "price": "$0.10"
  }
}
```

### Testing the API

We provide multiple ways to test the API:

#### 1. Quick Test Script

Run the simple shell test:

```bash
./test-request.sh
```

This tests the health endpoint and payment requirement flow.

#### 2. Full Test Suite

Run the comprehensive test client:

```bash
npm test
```

This will:
- Check API health
- Test unpaid requests (returns 402)
- Test paid requests (if CLIENT_PRIVATE_KEY is configured)
- Show the complete payment flow

See [TESTING.md](./TESTING.md) for detailed testing documentation.

#### 3. Manual Testing (Simple)

For quick testing without the full A2A protocol:

```bash
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"text": "Tell me a joke about programming"}'
```

This will return a payment required error since no payment was made.

#### Main Endpoint (A2A Compatible)

Send a request using the A2A message format:

```bash
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "parts": [
        {
          "kind": "text",
          "text": "What is the meaning of life?"
        }
      ]
    }
  }'
```

**Expected Response (402 Payment Required):**

```json
{
  "error": "Payment Required",
  "x402": {
    "x402Version": 1,
    "accepts": [
      {
        "scheme": "exact",
        "network": "base-sepolia",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "payTo": "0xYourAddress...",
        "maxAmountRequired": "100000",
        "resource": "/process-request",
        "description": "AI request processing service",
        "mimeType": "application/json",
        "maxTimeoutSeconds": 3600,
        "extra": {
          "name": "USDC",
          "version": "2"
        }
      }
    ],
    "error": "Payment required for service: /process-request"
  }
}
```

To complete the payment and process the request, you'll need to:

1. Create a payment payload using the x402 client library
2. Sign the payment with your wallet
3. Submit the payment back to the `/process` endpoint

For a complete client example, see the [`x402` library documentation](https://www.npmjs.com/package/x402).

## How It Works

### Payment Flow

1. **Client sends request** → API receives the request
2. **API requires payment** → Returns 402 with payment requirements
3. **Client signs payment** → Creates EIP-3009 authorization
4. **Client submits payment** → Sends signed payment back to API
5. **API verifies payment** → Checks signature and authorization
6. **API processes request** → Calls your service (OpenAI in this example)
7. **API settles payment** → Completes blockchain transaction
8. **API returns response** → Sends the service response

### Payment Verification

`src/MerchantExecutor.ts` sends the payment payload either to the configured x402 facilitator **or** verifies/settles locally, depending on the settlement mode:

- **Facilitator mode** (default): forwards payloads to `https://x402.org/facilitator` or the URL set in `FACILITATOR_URL`
- **Local mode**: verifies signatures with `ethers.verifyTypedData` and submits `transferWithAuthorization` via your configured RPC/PRIVATE_KEY

Make sure `SERVICE_URL` reflects the public URL of your paid endpoint so the facilitator can validate the `resource` field when using facilitator mode.

### Error Handling

- **Missing payment**: Returns 402 Payment Required
- **Invalid payment**: Returns payment verification failure
- **OpenAI error**: Returns error message in task status
- **Settlement failure**: Returns settlement error details

## Development

### Project Structure

```
x402-developer-starter-kit/
├── src/
│   ├── server.ts                     # Express server and endpoints
│   ├── ExampleService.ts             # Example service logic (replace with your own)
│   ├── MerchantExecutor.ts           # Payment verification & settlement helpers
│   ├── x402Types.ts                  # Shared task/message types
│   └── testClient.ts                 # Test client for development
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── TESTING.md
└── test-request.sh
```

### Building

```bash
npm run build
```

Compiled files will be in the `dist/` directory.

### Cleaning

```bash
npm run clean
```

## Testing with Real Payments

To test with real USDC payments:

1. Switch to a testnet (e.g., `base-sepolia`)
2. Get testnet USDC from a faucet
3. Use a client that implements the x402 protocol
4. Make sure your wallet has testnet ETH for gas

## Troubleshooting

### "OPENAI_API_KEY is required"

Make sure you've set `OPENAI_API_KEY` in your `.env` file.

### "PAY_TO_ADDRESS is required"

Make sure you've set `PAY_TO_ADDRESS` in your `.env` file to your wallet address.

### Payment verification fails

- Check that you're using the correct network
- Verify your wallet has USDC approval set
- Make sure the payment amount matches ($0.10)
- If signature verification fails, review the logged invalid reason and confirm the client signed the latest payment requirements
- For facilitator settlement errors, confirm the facilitator is reachable and that any `FACILITATOR_URL` / `FACILITATOR_API_KEY` settings are correct
- For local settlement errors, ensure your `PRIVATE_KEY` has gas and that the configured `RPC_URL` (or the network default) is responsive

### OpenAI rate limits

If you hit OpenAI rate limits, consider:
- Using `gpt-3.5-turbo` instead of `gpt-4o-mini`
- Implementing request queuing
- Adding rate limiting to your API
- Replacing OpenAI with your own service

## Security Considerations

- Never commit your `.env` file
- Keep your private key secure
- Use testnet for development
- Validate all payment data before processing
- Implement rate limiting for production
- Monitor for failed payment attempts

## Next Steps

- Replace the example OpenAI service with your own API logic
- Implement request queuing for high volume
- Add support for different payment tiers
- Create a web client interface
- Add analytics and monitoring
- Implement caching for common requests
- Add support for streaming responses

## License

ISC

## Resources

- [x402 Package on npm](https://www.npmjs.com/package/x402)
- [A2A Specification](https://github.com/google/a2a)
- [OpenAI API Documentation](https://platform.openai.com/docs)
