import { createCrossmint, CrossmintWallets, EVMWallet } from '@crossmint/wallets-sdk';
import type { PaymentPayload, PaymentRequirements } from 'x402/types';

export interface CrossmintPayerOptions {
  apiKey: string;
  owner: string; // e.g., "email:agent@yourdomain.com" or "id:your-service-id"
  chain: string; // e.g., "base-sepolia", "base", etc.
}

export interface PaymentResult {
  success: boolean;
  payload?: PaymentPayload;
  error?: string;
  transactionHash?: string;
  walletAddress?: string;
}

/**
 * CrossmintPayer - Handles outbound payments using Crossmint wallets
 * 
 * This class enables the agent to make payments to other x402 services
 * using the direct-transfer scheme with Crossmint smart wallets.
 * 
 * Note: This only works with merchants that accept scheme: "direct-transfer"
 * It does NOT work with EIP-3009 "exact" scheme due to smart wallet signature incompatibility.
 */
export class CrossmintPayer {
  private apiKey: string;
  private owner: string;
  private chain: string;
  private wallet?: EVMWallet;
  private walletAddress?: string;

  constructor(options: CrossmintPayerOptions) {
    this.apiKey = options.apiKey;
    this.owner = options.owner;
    this.chain = options.chain;
  }

  /**
   * Initialize the Crossmint wallet
   */
  async initialize(): Promise<void> {
    console.log('🔐 Initializing Crossmint wallet...');
    console.log(`   Owner: ${this.owner}`);
    console.log(`   Chain: ${this.chain}`);

    try {
      const crossmint = createCrossmint({ apiKey: this.apiKey });
      const wallets = CrossmintWallets.from(crossmint);

      const cmWallet = await wallets.createWallet({
        chain: this.chain as any,
        signer: { type: 'api-key' as const },
        owner: this.owner,
      });

      this.wallet = EVMWallet.from(cmWallet);
      this.walletAddress = this.wallet.address;

      console.log(`✅ Crossmint wallet initialized: ${this.walletAddress}`);
    } catch (error) {
      console.error('❌ Failed to initialize Crossmint wallet:', error);
      throw new Error(`Crossmint wallet initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the wallet address
   */
  getAddress(): string {
    if (!this.walletAddress) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }
    return this.walletAddress;
  }

  /**
   * Select a compatible payment requirement from the merchant's accepts array
   * Prefers direct-transfer scheme as it's compatible with Crossmint wallets
   */
  selectPaymentRequirement(paymentRequired: any): PaymentRequirements | null {
    const accepts = paymentRequired?.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0) {
      console.error('❌ No payment requirements provided by the merchant');
      return null;
    }

    const directTransfer = accepts.find((req: any) => req.scheme === 'direct-transfer');
    if (directTransfer) {
      console.log('✅ Found direct-transfer payment option (compatible with Crossmint)');
      return directTransfer as PaymentRequirements;
    }

    const exactOnly = accepts.every((req: any) => req.scheme === 'exact');
    if (exactOnly) {
      console.warn('⚠️  Merchant only accepts EIP-3009 "exact" scheme, which is incompatible with Crossmint smart wallets');
      console.warn('   Crossmint wallets use EIP-1271/ERC-6492 signatures that USDC\'s transferWithAuthorization won\'t accept');
      console.warn('   The merchant needs to support "direct-transfer" scheme for Crossmint payments');
      return null;
    }

    console.warn('⚠️  No direct-transfer option found, using first available option');
    return accepts[0] as PaymentRequirements;
  }

  /**
   * Execute a payment using direct-transfer scheme
   * Sends an ERC-20 transfer from the Crossmint wallet and returns the payment payload
   */
  async pay(paymentRequired: any): Promise<PaymentResult> {
    if (!this.wallet || !this.walletAddress) {
      return {
        success: false,
        error: 'Wallet not initialized. Call initialize() first.',
      };
    }

    const requirement = this.selectPaymentRequirement(paymentRequired);
    if (!requirement) {
      return {
        success: false,
        error: 'No compatible payment requirement found. Merchant must support "direct-transfer" scheme.',
      };
    }

    if ((requirement as any).scheme !== 'direct-transfer') {
      return {
        success: false,
        error: `Unsupported payment scheme: ${(requirement as any).scheme}. Crossmint wallets only support "direct-transfer".`,
      };
    }

    const asset = String(requirement.asset).trim();
    const payTo = String(requirement.payTo).trim();
    const amount = String(requirement.maxAmountRequired);

    console.log('\n💰 Executing payment with Crossmint wallet...');
    console.log(`   From: ${this.walletAddress}`);
    console.log(`   To: ${payTo}`);
    console.log(`   Asset: ${asset}`);
    console.log(`   Amount: ${amount} (atomic units)`);
    console.log(`   Network: ${requirement.network}`);

    try {
      console.log('📤 Sending ERC-20 transfer transaction...');
      const tx = await this.wallet.sendTransaction({
        abi: [
          {
            type: 'function',
            name: 'transfer',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
            ],
            outputs: [{ type: 'bool' }],
          },
        ],
        to: asset,
        functionName: 'transfer',
        args: [payTo, amount],
      } as any);

      const txHash = tx.hash as string;
      if (!txHash) {
        throw new Error('No transaction hash returned from Crossmint wallet');
      }

      console.log(`✅ Transaction submitted: ${txHash}`);

      const payload: PaymentPayload = {
        x402Version: paymentRequired.x402Version ?? 1,
        scheme: 'direct-transfer' as any,
        network: requirement.network,
        payload: {
          transaction: txHash,
          payer: this.walletAddress,
          asset,
          payTo,
          value: amount,
        } as any,
      };

      console.log('✅ Payment payload created');

      return {
        success: true,
        payload,
        transactionHash: txHash,
        walletAddress: this.walletAddress,
      };
    } catch (error) {
      console.error('❌ Payment execution failed:', error);
      return {
        success: false,
        error: `Payment failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if a merchant's payment requirements are compatible with Crossmint
   */
  static isCompatible(paymentRequired: any): boolean {
    const accepts = paymentRequired?.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0) {
      return false;
    }

    return accepts.some((req: any) => req.scheme === 'direct-transfer');
  }
}
