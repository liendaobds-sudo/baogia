import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AiSuggestPanel } from './AiSuggestPanel';
import type { Suggestion } from '../types';

function makeSuggestion(text: string): Suggestion {
    return {
        id: 'sug-1',
        replies: [{ text, label: 'Phản hồi A' }],
        missingInfo: [],
        confidence: 0.8,
        intent: 'hỏi giá',
        model: 'test',
        status: 'generated',
        createdAt: new Date().toISOString(),
    };
}

describe('AiSuggestPanel', () => {
    it('Req 8: vô hiệu hóa nút khi đang gửi và bật lại sau khi resolve', async () => {
        let resolveSend: () => void = () => {};
        const onAccept = jest.fn(() => new Promise<void>((r) => { resolveSend = r; }));

        render(
            <AiSuggestPanel
                latestSuggestion={makeSuggestion('Xin chào')}
                sentReplies={{}}
                onAcceptSuggestion={onAccept as any}
                onEditSuggestion={jest.fn()}
                onInjectText={jest.fn()}
            />,
        );

        const sendBtn = screen.getByLabelText('Gửi phản hồi 1');
        const editBtn = screen.getByLabelText('Sửa và gửi phản hồi 1');
        expect(sendBtn).toBeEnabled();

        fireEvent.click(sendBtn);
        // Trong khi pending, cả hai nút bị vô hiệu hóa.
        await waitFor(() => expect(sendBtn).toBeDisabled());
        expect(editBtn).toBeDisabled();

        // Click lần hai bị chặn (không gọi onAccept thêm).
        fireEvent.click(sendBtn);
        expect(onAccept).toHaveBeenCalledTimes(1);

        resolveSend();
        await waitFor(() => expect(sendBtn).toBeEnabled());
    });

    it('Req 13: nút gửi có accessible name', () => {
        render(
            <AiSuggestPanel
                latestSuggestion={makeSuggestion('Nội dung')}
                sentReplies={{}}
                onAcceptSuggestion={jest.fn()}
                onEditSuggestion={jest.fn()}
                onInjectText={jest.fn()}
            />,
        );
        expect(screen.getByLabelText('Gửi phản hồi 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Sửa và gửi phản hồi 1')).toBeInTheDocument();
    });

    it('Req 3: nội dung chứa <script> không tạo ra phần tử script thực thi', () => {
        const { container } = render(
            <AiSuggestPanel
                latestSuggestion={makeSuggestion('<script>alert(1)</script> **đậm**')}
                sentReplies={{}}
                onAcceptSuggestion={jest.fn()}
                onEditSuggestion={jest.fn()}
                onInjectText={jest.fn()}
            />,
        );
        // Không có thẻ <script> thực thi nào được tạo.
        expect(container.querySelector('script')).toBeNull();
        // Cú pháp **đậm** vẫn được render thành <strong>.
        expect(container.querySelector('strong')?.textContent).toBe('đậm');
    });
});
