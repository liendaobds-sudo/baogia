import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MessageBubble, ChatAvatar } from './MessageBubble';

// Mock dependencies
jest.mock('./ReactionIcon', () => () => <span data-testid="reaction-icon">Icon</span>);

const mockConversation = {
    id: 'conv1',
    contact: { displayName: 'John Doe', avatarUrl: '', externalUserId: 'g_123' }
};

const defaultProps: any = {
    msg: {
        id: 'msg1',
        content: 'Hello world',
        createdAt: '2023-10-01T10:00:00Z',
        senderType: 'customer',
        senderName: 'John',
        status: 'read'
    },
    isMine: false,
    isFirstInGroup: true,
    isLastInGroup: true,
    isMultiSelectMode: false,
    isSelected: false,
    isHovered: false,
    selectedConversation: mockConversation,
    messages: [],
    optimisticReactions: {},
    onToggleSelect: jest.fn(),
    onSetHovered: jest.fn(),
    onContextMenu: jest.fn(),
    onReact: jest.fn(),
    onSetLightbox: jest.fn(),
    onSetReplyingTo: jest.fn(),
    onSetForwardMsg: jest.fn(),
    onSetViewDetails: jest.fn(),
    onMultiSelect: jest.fn(),
    MessageActionsComponent: () => <div data-testid="msg-actions" />,
    inputRef: { current: null }
};

describe('MessageBubble Component', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders text message correctly', () => {
        render(<MessageBubble {...defaultProps} />);
        expect(screen.getByText('Hello world')).toBeInTheDocument();
        expect(screen.getByText('John')).toBeInTheDocument(); // Sender name
        expect(screen.getByTestId('msg-actions')).toBeInTheDocument();
    });

    it('applies multi-select styling and prevents actions', () => {
        const props = { ...defaultProps, isMultiSelectMode: true, isSelected: true };
        render(<MessageBubble {...props} />);
        
        // Actions should not render in multi-select mode
        expect(screen.queryByTestId('msg-actions')).not.toBeInTheDocument();
        
        const row = screen.getByText('Hello world').closest('.message-row');
        fireEvent.click(row!);
        expect(defaultProps.onToggleSelect).toHaveBeenCalledWith('msg1');
    });

    it('renders own message (isMine=true) with correct status', () => {
        const props = { 
            ...defaultProps, 
            isMine: true, 
            msg: { ...defaultProps.msg, senderType: 'agent', status: 'sent' } 
        };
        render(<MessageBubble {...props} />);
        
        // Own messages don't show the sender name
        expect(screen.queryByText('John')).not.toBeInTheDocument();
        // Should show 'Đã gửi' status
        expect(screen.getByText('Đã gửi')).toBeInTheDocument();
    });

    it('renders image attachments', () => {
        const props = {
            ...defaultProps,
            msg: {
                ...defaultProps.msg,
                contentType: 'image',
                content: '[Hình ảnh]',
                attachments: [{ type: 'image', url: 'http://example.com/img.jpg' }]
            }
        };
        render(<MessageBubble {...props} />);
        
        const img = screen.getByAltText('Attachment');
        expect(img).toHaveAttribute('src', 'http://example.com/img.jpg');
        
        fireEvent.click(img);
        expect(defaultProps.onSetLightbox).toHaveBeenCalledWith('http://example.com/img.jpg');
    });

    it('renders recalled message', () => {
        const props = {
            ...defaultProps,
            msg: { ...defaultProps.msg, status: 'recalled', content: 'Hidden text' }
        };
        render(<MessageBubble {...props} />);
        
        expect(screen.getByText('Tin nhắn đã thu hồi')).toBeInTheDocument();
        expect(screen.queryByText('Hidden text')).not.toBeInTheDocument();
    });

    it('renders quotes', () => {
        const props = {
            ...defaultProps,
            msg: { 
                ...defaultProps.msg, 
                content: '[Trả lời: Quoted text]\nMain message text'
            }
        };
        render(<MessageBubble {...props} />);
        
        expect(screen.getByText('Quoted text')).toBeInTheDocument();
        expect(screen.getByText('Main message text')).toBeInTheDocument();
        expect(screen.getByText('Trích dẫn')).toBeInTheDocument(); // Default author name when parsing regex
    });
});

describe('ChatAvatar', () => {
    it('renders image if url is provided', () => {
        render(<ChatAvatar url="http://example.com/avatar.jpg" nameStr="John" />);
        expect(screen.getByAltText('Avatar')).toHaveAttribute('src', 'http://example.com/avatar.jpg');
    });

    it('renders initial letter if no url is provided', () => {
        render(<ChatAvatar nameStr="Alice" />);
        expect(screen.getByText('A')).toBeInTheDocument();
        expect(screen.queryByAltText('Avatar')).not.toBeInTheDocument();
    });
});
