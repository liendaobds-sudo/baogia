/**
 * Cart State Service
 * Ported from Pricing: includes/ai_quote/ConversationState.php
 *
 * Manages multi-product quote state per conversation.
 * Supports: add, update, remove items; sequential quoting; price tracking.
 *
 * State is stored in-memory per conversation (keyed by conversationId).
 * For persistence, the state is serialized into AI suggestion context.
 */

import { Injectable, Logger } from '@nestjs/common';

// ─── Types ───

export interface CartItem {
    id: number;
    product: string;
    quantity: number;
    size?: { width: number; height: number; name?: string };
    type: 'loose' | 'bound' | 'large_format';
    status: 'pending' | 'quoting' | 'quoted';
    price?: number;
    /** Extra fields filled during quoting (material, finishing, etc.) */
    details: Record<string, any>;
}

export interface CartState {
    items: CartItem[];
    phase: 'collecting' | 'quoting' | 'complete';
    currentQuotingIndex: number;
    nextItemId: number;
}

@Injectable()
export class CartStateService {
    private readonly logger = new Logger(CartStateService.name);
    /** In-memory cart per conversation */
    private carts = new Map<string, CartState>();

    // ─── State Management ───

    /** Get or create cart for a conversation */
    getCart(conversationId: string): CartState {
        if (!this.carts.has(conversationId)) {
            this.carts.set(conversationId, {
                items: [],
                phase: 'collecting',
                currentQuotingIndex: -1,
                nextItemId: 1,
            });
        }
        return this.carts.get(conversationId)!;
    }

    /** Load cart state from serialized context (e.g., from AI suggestion) */
    loadFromContext(conversationId: string, context: any): CartState {
        if (context?.cartState) {
            this.carts.set(conversationId, context.cartState);
        }
        return this.getCart(conversationId);
    }

    /** Serialize cart state for storage in AI suggestion context */
    toContext(conversationId: string): Record<string, any> {
        const cart = this.getCart(conversationId);
        return { cartState: cart };
    }

    /** Clear cart for a conversation */
    clearCart(conversationId: string): void {
        this.carts.delete(conversationId);
    }

    // ─── Item Operations ───

    /** Add a new item to the cart */
    addItem(
        conversationId: string,
        product: string,
        quantity: number,
        size?: { width: number; height: number; name?: string },
        type: 'loose' | 'bound' | 'large_format' = 'loose',
    ): CartItem {
        const cart = this.getCart(conversationId);
        const item: CartItem = {
            id: cart.nextItemId++,
            product,
            quantity,
            size,
            type,
            status: 'pending',
            details: {},
        };
        cart.items.push(item);
        this.logger.log(`🛒 Added item #${item.id}: ${quantity}x ${product}`);
        return item;
    }

    /** Add multiple items at once (from multi_product detection) */
    addMultipleItems(
        conversationId: string,
        items: Array<{ product: string; quantity: number; size?: any; type?: string }>,
    ): CartItem[] {
        return items.map(item =>
            this.addItem(conversationId, item.product, item.quantity, item.size, (item.type as any) || 'loose'),
        );
    }

    /** Update an item's field value (during quoting) */
    updateItem(conversationId: string, itemId: number, field: string, value: any): boolean {
        const cart = this.getCart(conversationId);
        const item = cart.items.find(i => i.id === itemId);
        if (!item) return false;

        if (field === 'quantity') item.quantity = value;
        else if (field === 'product') item.product = value;
        else if (field === 'size') item.size = value;
        else if (field === 'type') item.type = value;
        else item.details[field] = value;

        return true;
    }

    /** Remove an item from the cart */
    removeItem(conversationId: string, itemId: number): boolean {
        const cart = this.getCart(conversationId);
        const idx = cart.items.findIndex(i => i.id === itemId);
        if (idx === -1) return false;
        cart.items.splice(idx, 1);
        return true;
    }

    /** Find item by product name (fuzzy match) */
    findItemByProduct(conversationId: string, productName: string): CartItem | null {
        const cart = this.getCart(conversationId);
        const normalized = productName.toLowerCase().trim();

        // Exact match first
        let found = cart.items.find(i => i.product.toLowerCase() === normalized);
        if (found) return found;

        // Partial match
        found = cart.items.find(i =>
            normalized.includes(i.product.toLowerCase()) || i.product.toLowerCase().includes(normalized),
        );
        return found ?? null;
    }

    // ─── Quoting Flow ───

    /** Start sequential quoting — find first pending item */
    startQuoting(conversationId: string): CartItem | null {
        const cart = this.getCart(conversationId);
        cart.phase = 'quoting';

        const pendingIdx = cart.items.findIndex(i => i.status === 'pending');
        if (pendingIdx === -1) return null;

        cart.currentQuotingIndex = pendingIdx;
        cart.items[pendingIdx].status = 'quoting';
        return cart.items[pendingIdx];
    }

    /** Get the item currently being quoted */
    getCurrentQuotingItem(conversationId: string): CartItem | null {
        const cart = this.getCart(conversationId);
        if (cart.currentQuotingIndex < 0 || cart.currentQuotingIndex >= cart.items.length) return null;
        return cart.items[cart.currentQuotingIndex];
    }

    /** Mark current item as quoted and move to next pending item */
    markItemQuoted(conversationId: string, price?: number): CartItem | null {
        const cart = this.getCart(conversationId);
        const current = this.getCurrentQuotingItem(conversationId);
        if (current) {
            current.status = 'quoted';
            if (price !== undefined) current.price = price;
        }

        // Find next pending item
        const nextIdx = cart.items.findIndex(i => i.status === 'pending');
        if (nextIdx === -1) {
            cart.phase = 'complete';
            cart.currentQuotingIndex = -1;
            return null;
        }

        cart.currentQuotingIndex = nextIdx;
        cart.items[nextIdx].status = 'quoting';
        return cart.items[nextIdx];
    }

    /** Check if all items are quoted */
    allItemsQuoted(conversationId: string): boolean {
        const cart = this.getCart(conversationId);
        return cart.items.length > 0 && cart.items.every(i => i.status === 'quoted');
    }

    // ─── Display ───

    /** Format items for display in chat */
    formatItemsList(conversationId: string): string {
        const cart = this.getCart(conversationId);
        if (cart.items.length === 0) return '🛒 Giỏ trống';

        return cart.items.map((item, idx) => {
            const statusIcon = item.status === 'quoted' ? '✅' : item.status === 'quoting' ? '⏳' : '⬜';
            const priceStr = item.price ? ` — ${item.price.toLocaleString('vi-VN')}đ` : '';
            const sizeStr = item.size?.name ? ` ${item.size.name}` : '';
            return `${statusIcon} ${idx + 1}. ${item.quantity}x ${item.product}${sizeStr}${priceStr}`;
        }).join('\n');
    }

    /** Get summary stats */
    getSummary(conversationId: string): { itemCount: number; quotedCount: number; totalPrice: number } {
        const cart = this.getCart(conversationId);
        return {
            itemCount: cart.items.length,
            quotedCount: cart.items.filter(i => i.status === 'quoted').length,
            totalPrice: cart.items.reduce((sum, i) => sum + (i.price ?? 0), 0),
        };
    }
}
