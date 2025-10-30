import OpenAI from 'openai';
import { EventQueue, RequestContext, TaskState } from './x402Types.js';

type AiProvider = 'openai' | 'eigenai' | 'gaia';

interface ExampleServiceOptions {
  apiKey?: string;
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  provider: AiProvider;
  payToAddress: string;
  network: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  seed?: number;
}

/**
 * ExampleService - A sample service implementation using an OpenAI-compatible API
 *
 * This is a demonstration of how to process paid requests.
 * Replace this with your own service logic (database queries, computations, API calls, etc.)
 *
 * Payment validation is handled by the server before this service is invoked.
 */
export class ExampleService {
  private openai: OpenAI;
  private payToAddress: string;
  private network: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens?: number;
  private readonly seed?: number;
  private readonly provider: AiProvider;

  constructor({
    apiKey,
    baseUrl,
    defaultHeaders,
    provider,
    payToAddress,
    network,
    model,
    temperature = 0.7,
    maxTokens = 500,
    seed,
  }: ExampleServiceOptions) {
    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {};

    if (provider === 'openai') {
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required when using the OpenAI provider');
      }
      clientOptions.apiKey = apiKey;
    } else if (provider === 'eigenai') {
      if (!defaultHeaders?.['x-api-key']) {
        throw new Error('EIGENAI_API_KEY is required when using the EigenAI provider');
      }
      clientOptions.apiKey = defaultHeaders['x-api-key'];
    } else if (provider === 'gaia') {
      if (!apiKey) {
        throw new Error('GAIA_API_KEY is required when using the Gaia provider');
      }
      clientOptions.apiKey = apiKey;
    }

    if (baseUrl) {
      clientOptions.baseURL = baseUrl;
    }

    if (defaultHeaders && Object.keys(defaultHeaders).length > 0) {
      clientOptions.defaultHeaders = defaultHeaders;
    }

    // For Gaia, we need to ensure the Authorization header is set correctly
    if (provider === 'gaia' && apiKey) {
      clientOptions.defaultHeaders = {
        ...clientOptions.defaultHeaders,
        'Authorization': `Bearer ${apiKey}`
      };
    }

    this.openai = new OpenAI(clientOptions);
    this.payToAddress = payToAddress;
    this.network = network;
    this.model = model ?? (provider === 'eigenai' ? 'gpt-oss-120b-f16' : (provider === 'gaia' ? 'llama' : 'gpt-4o-mini'));
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.seed = seed;
    this.provider = provider;
  }

  async execute(context: RequestContext, eventQueue: EventQueue): Promise<void> {
    const task = context.currentTask;

    if (!task) {
      throw new Error('No task found in context');
    }
    console.log('✅ Payment verified, processing request...');

    // Extract user message from the context
    const userMessage = context.message?.parts
      ?.filter((part: any) => part.kind === 'text')
      .map((part: any) => part.text)
      .join(' ') || 'Hello';

    console.log(`📝 User request: ${userMessage}`);

    try {
      // Call OpenAI API to process the request
      // REPLACE THIS with your own service logic
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Provide concise and accurate responses.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        ...(this.provider === 'eigenai' && this.seed !== undefined
          ? { seed: this.seed }
          : {}),
      });

      const response = completion.choices[0]?.message?.content || 'No response generated';

      console.log(`🤖 Service response: ${response}`);

      // Update task with the response
      task.status.state = TaskState.COMPLETED;
      task.status.message = {
        messageId: `msg-${Date.now()}`,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: response,
          },
        ],
      };

      // Enqueue the completed task
      await eventQueue.enqueueEvent(task);

      console.log('✨ Request processed successfully');
    } catch (error) {
      console.error('❌ Error processing request:', error);

      // Update task with error
      task.status.state = TaskState.FAILED;
      task.status.message = {
        messageId: `msg-${Date.now()}`,
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };

      await eventQueue.enqueueEvent(task);
      throw error;
    }
  }
}