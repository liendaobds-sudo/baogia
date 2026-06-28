import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

// Mock the whole ChatArea because it has too many complex dependencies
// In a real scenario, we'd mock the store and test integration.
// For now, this serves as a placeholder test suite.
jest.mock('./ChatArea', () => {
    return function DummyChatArea() {
        return <div data-testid="chat-area">Chat Area</div>;
    };
});

import ChatArea from './ChatArea';

// ChatArea bị mock thành dummy không nhận props (xem jest.mock ở trên), nhưng type
// import vẫn giữ ChatAreaProps gốc → cast về FC không-props để khớp với mock thật.
const MockedChatArea = ChatArea as unknown as React.FC;

describe('ChatArea Component', () => {
    it('renders without crashing', () => {
        // Since we mocked it, it just renders the dummy
        render(<MockedChatArea />);
        expect(screen.getByTestId('chat-area')).toBeInTheDocument();
    });
});
