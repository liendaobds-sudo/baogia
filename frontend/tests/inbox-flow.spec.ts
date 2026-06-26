import { test, expect } from '@playwright/test';

test.describe('Zalo Inbox Flow (Mocked API)', () => {
  test('Load conversations, select one, and send a message', async ({ page }) => {
    // Log console messages from the browser
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    
    // 1. Mock API Responses

    // Bắt tất cả các API khác để tránh bị 401 Unauthorized dẫn đến tự động logout
    await page.route('**/api/v1/**', async (route) => {
      // API /suggestions trả về array trực tiếp
      if (route.request().url().includes('/suggestions/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
        return;
      }
      // Các API khác trả về format chuẩn
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] })
      });
    });

    
    // Mock user info (nếu có AuthGuard chặn ở frontend)
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: 1, name: 'Admin', role: 'admin' }
        })
      });
    });

    // Mock conversations list
    await page.route('**/api/v1/conversations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'conv-123',
              contact: { displayName: 'Khách hàng Playwright', avatarUrl: '' },
              channel: { type: 'zalo_personal' },
              status: 'new',
              unreadCount: 1,
              lastMessage: 'Cho tôi hỏi giá in túi giấy',
              lastMessageAt: new Date().toISOString(),
              tags: [],
            }
          ]
        })
      });
    });

    // Mock messages for conversation 'conv-123'
    await page.route('**/api/v1/conversations/conv-123/messages*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'msg-1',
              conversation_id: 'conv-123',
              direction: 'inbound',
              content: 'Cho tôi hỏi giá in túi giấy',
              type: 'text',
              status: 'received',
              createdAt: new Date().toISOString(),
            }
          ]
        })
      });
    });

    // Mock send message API
    await page.route('**/api/v1/conversations/*/send', async (route) => {
      if (route.request().method() === 'POST') {
        const postData = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'msg-2',
            conversation_id: 'conv-123',
            direction: 'outbound',
            content: postData.text || 'Dạ vâng, bên em có in túi giấy ạ.',
            contentType: 'text',
            status: 'sent',
            createdAt: new Date().toISOString(),
          })
        });
      } else {
        await route.continue();
      }
    });

    // 2. Perform UI Interactions
    // Bơm Token giả vào localStorage để AuthProvider tưởng là đã đăng nhập hợp lệ
    await page.addInitScript(() => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const payload = btoa(JSON.stringify({ exp, sub: 'user-1' }));
      const fakeJwt = `header.${payload}.signature`;
      localStorage.setItem('zh_token', fakeJwt);
      localStorage.setItem('zh_user', JSON.stringify({ id: 'user-1', fullName: 'Khánh Phạm', role: 'admin' }));
    });

    await page.goto('/inbox');

    // Chờ danh sách hội thoại load xong
    console.log('Current URL before waiting:', page.url());
    const conversationItem = page.locator('text=Khách hàng Playwright');
    try {
      await expect(conversationItem).toBeVisible({ timeout: 15000 });
    } catch (e) {
      console.log('Current URL at failure:', page.url());
      console.log('Page content snapshot:', await page.content());
      throw e;
    }

    // Click vào hội thoại
    await conversationItem.click();

    // Kiểm tra tin nhắn của khách hàng hiển thị trong Chat Area
    const inboundMessage = page.locator('text=Cho tôi hỏi giá in túi giấy').first();
    await expect(inboundMessage).toBeVisible();

    // Gõ tin nhắn phản hồi
    const chatInput = page.getByPlaceholder(/Nhập tin nhắn/i);
    await expect(chatInput).toBeVisible();
    await chatInput.fill('Dạ vâng, bên em có in túi giấy ạ.');

    // Bấm phím Enter để gửi
    await chatInput.press('Enter');

    // Mặc dù gọi API POST thành công, Frontend có thể cập nhật trạng thái Optimistic hoặc chờ Websocket. 
    // Trong môi trường Mock, tuỳ thuộc vào code thực tế của store/context, có thể cần mock response của WebSockets.
    // Tạm thời, chúng ta expect giao diện không crash và tin nhắn (có thể) đã hiện lên UI.
    const outboundMessage = page.locator('text=Dạ vâng, bên em có in túi giấy ạ.').first();
    await expect(outboundMessage).toBeVisible();
  });
});
