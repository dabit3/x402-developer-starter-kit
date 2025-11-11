# Deploying to EigenCompute with EigenX

EigenX enables deployment of containerized applications to Trusted Execution Environments (TEEs) with built-in private key management and hardware-level isolation.

## Prerequisites

1. **Allowlisted Account** - Submit an [onboarding request](https://forms.gle/eigenx-onboarding) with your Ethereum address
2. **Docker** - For building and pushing application images
3. **Sepolia ETH** - For deployment transactions ([Google Cloud Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) | [Alchemy Faucet](https://www.alchemy.com/faucets/ethereum-sepolia))

## Installation

**macOS/Linux:**
```bash
curl -fsSL https://eigenx-scripts.s3.us-east-1.amazonaws.com/install-eigenx.sh | bash
```

**Windows:**
```powershell
curl -fsSL https://eigenx-scripts.s3.us-east-1.amazonaws.com/install-eigenx.ps1 | powershell -
```

## Deployment Steps

### 1. Initial Setup

```bash
# Login to Docker registry
docker login

# Authenticate with EigenX (existing key)
eigenx auth login

# Or generate new key
eigenx auth generate --store

# Verify authentication
eigenx auth whoami
```

### 2. Create New Application

```bash
# Create from template (typescript | python | golang | rust)
eigenx app create my-app typescript
cd my-app

# Configure environment variables
cp .env.example .env
# Edit .env with your configuration
```

### 3. Deploy to TEE

```bash
eigenx app deploy
```

### 4. Monitor Your Application

```bash
# View app details
eigenx app info

# Stream logs
eigenx app logs --watch
```

## Deploying Existing Projects

EigenX works with any Docker-based project:

```bash
cd my-existing-project

# Ensure you have:
# - Dockerfile (must target linux/amd64, run as root)
# - .env file (optional)

eigenx app deploy
```

## Key Features

- **Secure Execution** - Intel TDX hardware isolation
- **Auto-Generated Wallet** - Access via `process.env.MNEMONIC`
- **Private Environment Variables** - Encrypted within TEE
- **Public Variables** - Suffix with `_PUBLIC` for transparency

## Common Commands

```bash
eigenx app list                    # List all apps
eigenx app upgrade my-app          # Update deployment
eigenx app stop my-app             # Stop app
eigenx app start my-app            # Start app
eigenx app terminate my-app        # Remove app permanently
```

## TLS/HTTPS Setup (Optional)

```bash
# Add TLS configuration
eigenx app configure tls

# Configure DNS A record pointing to instance IP
# Set in .env:
# DOMAIN=yourdomain.com
# APP_PORT=3000
# ACME_STAGING=true  # Test first

eigenx app upgrade
```

## Advanced: Manual Image Deployment

```bash
# Build and push manually
docker build --platform linux/amd64 -t myregistry/myapp:v1.0 .
docker push myregistry/myapp:v1.0

# Deploy using image reference
eigenx app deploy myregistry/myapp:v1.0
```

## Important Notes

⚠️ **Mainnet Alpha Limitations:**
- Not recommended for significant customer funds
- Developer is still trusted (full verifiability coming later)
- No SLA guarantees

⚠️ **Alpha Software:**
- Under active development, not audited
- Use for testing only, not production
- Breaking changes expected

---

**Need Help?**
- Check authentication: `eigenx auth whoami`
- View app status: `eigenx app info --watch`
- Report issues: https://github.com/Layr-Labs/eigenx-cli/issues
