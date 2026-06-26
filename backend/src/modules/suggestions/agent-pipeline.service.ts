/**
 * Agent Pipeline Service
 * Implements multi-step agentic RAG using Gemini function calling.
 *
 * Instead of single-shot prompt → response, the AI can:
 * 1. Decide it needs more information
 * 2. Call tools (search KB, calculate quote, lookup customer)
 * 3. Use tool results to generate a better final response
 *
 * This addresses the core problem of AI "not understanding context" by
 * allowing it to actively gather information before responding.
 */

import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsGateway } from '../gateway/events.gateway';
import { AiProviderService } from './ai-provider.service';
import { BaseTool } from './tools/base.tool';
import { SearchKnowledgeBaseTool } from './tools/search-kb.tool';
import { GetProductInfoTool } from './tools/product-info.tool';
import { CheckMissingInfoTool } from './tools/missing-info.tool';
import { SearchSimilarConvTool } from './tools/similar-conv.tool';
import { OutcomeInsightsTool } from './tools/outcome-insights.tool';

// Maximum number of tool-calling rounds before forcing a final response
const MAX_AGENT_STEPS = 4; // Increased for multi-turn capability
const AGENT_TIMEOUT_MS = 25000; // Total timeout for agent pipeline


interface AgentResult {
    response: string;
    toolCalls: { tool: string; args: any; result: string }[];
    steps: number;
    usedAgent: boolean;
}

@Injectable()
export class AgentPipelineService {
    private readonly logger = new Logger(AgentPipelineService.name);
    private readonly toolsMap = new Map<string, BaseTool>();
    private readonly geminiTools: any;

    constructor(
        private readonly configService: ConfigService,
        private readonly eventsGateway: EventsGateway,
        @Inject(forwardRef(() => AiProviderService)) private readonly aiProviderService: AiProviderService,
        searchKbTool: SearchKnowledgeBaseTool,
        productInfoTool: GetProductInfoTool,
        missingInfoTool: CheckMissingInfoTool,
        similarConvTool: SearchSimilarConvTool,
        outcomeInsightsTool: OutcomeInsightsTool,
    ) {
        // Dynamic Tool Registry Registration
        this.registerTool(searchKbTool);
        this.registerTool(productInfoTool);
        this.registerTool(missingInfoTool);
        this.registerTool(similarConvTool);
        this.registerTool(outcomeInsightsTool);

        // Precompile Gemini tools schema
        this.geminiTools = [{
            functionDeclarations: Array.from(this.toolsMap.values()).map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            })),
        }];
        this.logger.log(`🛠️ Agent registered ${this.toolsMap.size} dynamic tools`);
    }

    private registerTool(tool: BaseTool) {
        this.toolsMap.set(tool.name, tool);
    }

    /**
     * Run the agent pipeline: let Gemini decide which tools to call
     * before generating the final response.
     *
     * @param systemPrompt - The system prompt with all context
     * @param userPrompt - The user prompt with chat history
     * @param conversationContext - Additional context from the conversation
     * @returns AgentResult with the final response and tool call history
     */
    async runAgentPipeline(
        conversationId: string,
        systemPrompt: string,
        userPrompt: string,
        conversationContext: {
            productMatch?: any;
            printingKnowledge?: any;
        },
    ): Promise<AgentResult> {
        const providers = this.aiProviderService.getProviders();
        const geminiProvider = providers.find(p => p.name === 'gemini');
        
        if (!geminiProvider) {
            this.logger.warn('⚠️ Gemini provider not available for Agent Pipeline. Falling back to standard path.');
            return { response: '', toolCalls: [], steps: 0, usedAgent: false };
        }

        // Resilience: nếu circuit của Gemini đang OPEN (đang lỗi liên tiếp) → bỏ agent pipeline,
        // để standard path (callWithFallback đa-provider) xử lý. Tránh phí 1 vòng chắc-chắn-lỗi.
        const circuits = this.aiProviderService.getCircuitStatus();
        if (circuits['gemini']?.state === 'open') {
            this.logger.warn('⚡ Gemini circuit OPEN — bỏ agent pipeline, dùng standard fallback path');
            return { response: '', toolCalls: [], steps: 0, usedAgent: false };
        }

        const { apiKey, endpoint, model } = geminiProvider;

        const startTime = Date.now();
        const toolCallHistory: { tool: string; args: any; result: string }[] = [];
        let stepCount = 0;

        // Build initial conversation for Gemini
        const contents: any[] = [
            {
                role: 'user',
                parts: [{ text: userPrompt }],
            },
        ];

        try {
            while (stepCount < MAX_AGENT_STEPS) {
                // Check timeout
                if (Date.now() - startTime > AGENT_TIMEOUT_MS) {
                    this.logger.warn(`⏰ Agent pipeline timeout after ${stepCount} steps`);
                    break;
                }

                stepCount++;
                const url = `${endpoint}/models/${model}:generateContent?key=${apiKey}`;

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents,
                        tools: this.geminiTools,
                        generationConfig: {
                            temperature: 0.3,
                            maxOutputTokens: 1000,
                        },
                    }),
                    signal: AbortSignal.timeout(15000),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Gemini agent API ${response.status}: ${errorText.substring(0, 200)}`);
                }

                const data: any = await response.json();
                const candidate = data.candidates?.[0];
                if (!candidate) throw new Error('No candidate in agent response');

                const parts = candidate.content?.parts || [];

                // Check if the model wants to call a function
                const functionCall = parts.find((p: any) => p.functionCall);

                if (functionCall) {
                    const { name, args } = functionCall.functionCall;
                    this.logger.log(`🔧 Agent step ${stepCount}: calling tool "${name}" with args: ${JSON.stringify(args).substring(0, 200)}`);

                    // 1. Emit "Thinking" Monologue (SSE/Websocket streaming)
                    this.eventsGateway.server.emit('agent_thought', {
                        conversationId,
                        status: 'thinking',
                        tool: name,
                        message: `Đang liên kết công cụ ${name}...`
                    });

                    // Execute the tool dynamically
                    const toolResult = await this.executeTool(name, args, conversationContext);
                    toolCallHistory.push({ tool: name, args, result: toolResult });
                    
                    // 2. Emit Tool Result Monologue
                    this.eventsGateway.server.emit('agent_thought', {
                        conversationId,
                        status: 'tool_result_ready',
                        tool: name,
                        message: `Đã có dữ liệu. Đang tư duy tiếp...`
                    });

                    // Add model's function call to conversation
                    contents.push({
                        role: 'model',
                        parts: [{ functionCall: { name, args } }],
                    });

                    // Add tool result back to conversation
                    contents.push({
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name,
                                response: { result: toolResult },
                            },
                        }],
                    });

                    // Continue the loop — model will process tool result
                    continue;
                }

                // No function call — model generated a text response (final answer)
                const textPart = parts.find((p: any) => p.text);
                if (textPart?.text) {
                    this.logger.log(`✅ Agent pipeline completed in ${stepCount} steps, ${toolCallHistory.length} tool calls, ${Date.now() - startTime}ms`);
                    return {
                        response: textPart.text,
                        toolCalls: toolCallHistory,
                        steps: stepCount,
                        usedAgent: toolCallHistory.length > 0,
                    };
                }

                // Neither function call nor text — unexpected, break
                break;
            }

            // Max steps reached or other exit — get final response without tools
            this.logger.warn(`⚠️ Agent reached max steps (${stepCount}), forcing final response`);
            return {
                response: '',
                toolCalls: toolCallHistory,
                steps: stepCount,
                usedAgent: toolCallHistory.length > 0,
            };
        } catch (e) {
            this.logger.error(`❌ Agent pipeline error: ${(e as Error).message}`);
            return {
                response: '',
                toolCalls: toolCallHistory,
                steps: stepCount,
                usedAgent: false,
            };
        }
    }

    /**
     * Execute a tool call using the Dynamic Tool Registry
     */
    private async executeTool(
        toolName: string,
        args: any,
        context: { productMatch?: any; printingKnowledge?: any },
    ): Promise<string> {
        try {
            const tool = this.toolsMap.get(toolName);
            if (!tool) {
                return `Tool "${toolName}" không tồn tại trong Registry.`;
            }
            return await tool.execute(args, context);
        } catch (e) {
            this.logger.warn(`⚠️ Tool "${toolName}" failed: ${(e as Error).message}`);
            return `Lỗi khi gọi tool: ${(e as Error).message}`;
        }
    }
}
