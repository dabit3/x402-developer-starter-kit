import { CrossmintPayer } from './CrossmintPayer.js';
import type { Message } from './x402Types.js';

export interface OutboundX402ClientOptions {
  crossmintPayer: CrossmintPayer;
}

export interface CallResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class OutboundX402Client {
  private payer: CrossmintPayer;

  constructor(options: OutboundX402ClientOptions) {
    this.payer = options.crossmintPayer;
  }

  async callPaidApi(url: string, text: string): Promise<CallResult> {
    console.log(`\n🔗 Calling upstream x402 service: ${url}`);
    console.log(`   Message: ${text}`);

    try {
      const initialResponse = await this.sendInitialRequest(url, text);

      if (!initialResponse.x402) {
        console.log('✅ Request processed without payment (unexpected)');
        return {
          success: true,
          data: initialResponse,
        };
      }

      console.log('💰 Payment required, processing with Crossmint wallet...');
      const paymentRequired = initialResponse.x402;

      if (!CrossmintPayer.isCompatible(paymentRequired)) {
        console.error('❌ Upstream service does not support direct-transfer scheme');
        return {
          success: false,
          error: 'Upstream service incompatible with Crossmint payments (requires direct-transfer scheme)',
        };
      }

      const paymentResult = await this.payer.pay(paymentRequired);

      if (!paymentResult.success || !paymentResult.payload) {
        console.error(`❌ Payment failed: ${paymentResult.error}`);
        return {
          success: false,
          error: paymentResult.error || 'Payment failed',
        };
      }

      console.log('✅ Payment successful, resubmitting request with payment...');
      const paidResponse = await this.sendPaidRequest(url, text, paymentResult.payload, initialResponse);

      if (paidResponse.success) {
        console.log('✅ Upstream request completed successfully');
        return {
          success: true,
          data: paidResponse,
        };
      } else {
        console.error(`❌ Paid request failed: ${paidResponse.error}`);
        return {
          success: false,
          error: paidResponse.error || 'Paid request failed',
        };
      }
    } catch (error) {
      console.error('❌ Error calling upstream service:', error);
      return {
        success: false,
        error: `Failed to call upstream service: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async sendInitialRequest(url: string, text: string): Promise<any> {
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

    const response = await fetch(`${url}/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        taskId: `task-${Date.now()}`,
        contextId: `context-${Date.now()}`,
      }),
    });

    return await response.json();
  }

  private async sendPaidRequest(url: string, text: string, paymentPayload: any, initialResponse: any): Promise<any> {
    const taskId = initialResponse.task?.id || `task-${Date.now()}`;
    const contextId = initialResponse.task?.contextId || `context-${Date.now()}`;

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

    const response = await fetch(`${url}/process`, {
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

    return await response.json();
  }
}
