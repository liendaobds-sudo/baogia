import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import PricingSidebar from './PricingSidebar';

// Mock next/navigation
jest.mock('next/navigation', () => ({
    usePathname: jest.fn().mockReturnValue('/pricing/customers'),
}));

// Mock hook Cờ_Năng_Lực (Task 4.6) để sidebar không phụ thuộc React Query trong unit test:
// trả tập đã nạp xong với cả hai phương pháp bật ⇒ menu hiển thị như trước khi có lọc theo
// Cờ_Năng_Lực (việc lọc theo năng lực được kiểm riêng ở test property của ia-resolver).
jest.mock('@/lib/scope/use-enabled-methods', () => ({
    useEnabledMethods: () => ({
        enabledMethods: ['digital', 'offset'],
        loaded: true,
        error: false,
    }),
}));

// Mock hook Trục_Ứng_Dụng — điều khiển qua biến `mockEnabledApps` để test ẩn/hiện link
// chéo "Inbox CSKH". Mặc định CSKH bật (giữ hành vi test cũ).
let mockEnabledApps: string[] = ['baogia', 'cskh'];
jest.mock('@/lib/scope/use-enabled-apps', () => ({
    useEnabledApps: () => ({
        enabledApps: mockEnabledApps,
        loaded: true,
        error: false,
    }),
}));

// Mock next/link to just render anchor tags
jest.mock('next/link', () => {
    return ({ children, href, className, ...rest }: any) => (
        <a href={href} className={className} {...rest}>
            {children}
        </a>
    );
});

describe('PricingSidebar Component', () => {
    const defaultProps = {
        collapsed: false,
        onToggle: jest.fn(),
        userName: 'Admin User',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEnabledApps = ['baogia', 'cskh']; // reset: CSKH bật mặc định
    });

    it('hiện link "Inbox CSKH" khi tenant bật CSKH', () => {
        mockEnabledApps = ['baogia', 'cskh'];
        render(<PricingSidebar {...defaultProps} />);
        expect(screen.getByText('Inbox CSKH')).toBeInTheDocument();
    });

    it('ẩn link "Inbox CSKH" khi tenant TẮT CSKH', () => {
        mockEnabledApps = ['baogia'];
        render(<PricingSidebar {...defaultProps} />);
        expect(screen.queryByText('Inbox CSKH')).not.toBeInTheDocument();
    });

    it('renders sidebar with user name and logo', () => {
        render(<PricingSidebar {...defaultProps} />);
        
        expect(screen.getByText('Báo Giá')).toBeInTheDocument();
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        // User initial
        expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('highlights the active link based on pathname', () => {
        const { container } = render(<PricingSidebar {...defaultProps} />);
        // '/pricing/customers' should have 'active' class
        const customersLink = screen.getByText('Khách hàng').closest('a');
        expect(customersLink).toHaveClass('active');
        
        // '/pricing' should not be active
        const dashboardLink = screen.getByText('Dashboard').closest('a');
        expect(dashboardLink).not.toHaveClass('active');
    });

    it('toggles collapsible menus when clicked', () => {
        render(<PricingSidebar {...defaultProps} />);
        
        // Expand the "Vật tư & Cấu hình" menu
        const settingsMenuHeader = screen.getByText('Vật tư & Cấu hình').closest('a');
        fireEvent.click(settingsMenuHeader!);

        // Children should now be visible
        expect(screen.getByText('Khổ giấy')).toBeInTheDocument();

        // Click again to collapse
        fireEvent.click(settingsMenuHeader!);
        expect(screen.queryByText('Khổ giấy')).not.toBeInTheDocument();
    });

    it('calls onToggle when toggle button is clicked', () => {
        render(<PricingSidebar {...defaultProps} />);
        
        const toggleBtn = screen.getByTitle('Thu gọn');
        fireEvent.click(toggleBtn);
        
        expect(defaultProps.onToggle).toHaveBeenCalledTimes(1);
    });

    it('renders correctly in collapsed mode', () => {
        render(<PricingSidebar {...defaultProps} collapsed={true} />);
        
        // Logo text should be hidden
        expect(screen.queryByText('Báo Giá')).not.toBeInTheDocument();
        // User name should be hidden, but initial 'A' should be visible
        expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument();
        
        // Toggle button should say 'Mở rộng'
        expect(screen.getByTitle('Mở rộng')).toBeInTheDocument();
    });
});
