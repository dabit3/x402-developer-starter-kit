# Quick Start Guide

Get the x402 payment API running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- OpenAI, EigenAI, or Gaia API key ([Get one here](https://platform.openai.com/api-keys))
- A wallet address to receive USDC payments

## Setup Steps

### 1. Run the setup script

```bash
./setup.sh
```

This will:
- Install dependencies
- Create a .env file from template
- Build the API

### 2. Configure environment variables

Edit the `.env` file:

```bash
nano .env
```

**Required variables (choose one provider):**

For OpenAI:
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-api-key
```

For EigenAI:
```env
AI_PROVIDER=eigenai
EIGENAI_API_KEY=your-eigenai-api-key
```

For Gaia:
```env
AI_PROVIDER=gaia
GAIA_API_KEY=your-gaia-api-key
GAIA_NODE_URL=https://your-node-id.gaia.domains/v1
```

**Payment configuration:**
```env
PAY_TO_ADDRESS=0xYourWalletAddress
```

**Optional variables:**

```env
PORT=3000
NETWORK=base-sepolia  # for testing
PRIVATE_KEY=your_private_key  # if needed
X402_DEBUG=true  # for detailed logs
```

### 3. Start the API

```bash
npm start
```

You should see:

```
🚀 x402 Payment API initialized
💰 Payment address: 0xYourAddress...
🌐 Network: base-sepolia
💵 Price per request: $0.10 USDC

✅ Server running on http://localhost:3000
📖 Health check: http://localhost:3000/health
🧪 Test endpoint: POST http://localhost:3000/test
🚀 Main endpoint: POST http://localhost:3000/process
```

### 4. Test the API

In a new terminal:

```bash
./test-request.sh
```

You should see a `402 Payment Required` response with payment details!

## What happens next?

1. **Without payment**: The API returns 402 with payment requirements
2. **With payment**: A client signs a payment, sends it, and receives the service response

## Testing with payment

To actually process requests (with payment), you need:

1. An x402-compatible client library
2. A wallet with USDC and gas tokens
3. Testnet setup (recommended: base-sepolia)

See the [full README](./README.md) for complete documentation.

## Common Issues

### "OPENAI_API_KEY is required"

Make sure `.env` file exists and has `OPENAI_API_KEY` set when using OpenAI provider.

### "EIGENAI_API_KEY is required"

Make sure `.env` file exists and has `EIGENAI_API_KEY` set when using EigenAI provider.

### "GAIA_API_KEY is required"

Make sure `.env` file exists and has `GAIA_API_KEY` and `GAIA_NODE_URL` set when using Gaia provider.

### "PAY_TO_ADDRESS is required"

Add your wallet address to `.env`:

```env
PAY_TO_ADDRESS=0xYourAddress
```

### Build fails

Try cleaning and rebuilding:

```bash
npm run clean
npm install
npm run build
```

### Can't connect to server

Check if the port is already in use:

```bash
lsof -i :3000
```

Change the port in `.env`:

```env
PORT=3001
```

## Next Steps

- Read the [full README](./README.md) for detailed documentation
- Check the [x402 package](https://www.npmjs.com/package/x402) for payment integration
- Build a client to interact with your API
- Replace the AI example with your own service logic
- Deploy to production

## Support

For issues or questions:
- Check the README.md
- Review the x402 library docs
- Open an issue on GitHub

Happy building! 🚀