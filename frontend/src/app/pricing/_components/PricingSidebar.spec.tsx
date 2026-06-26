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
        
        // Expand the "Vật tư & Danh mục" menu
        const settingsMenuHeader = screen.getByText('Vật tư & Danh mục').closest('a');
        fireEvent.click(settingsMenuHeader!);
        
        // Children should now be visible
        expect(screen.getByText('Khổ Giấy')).toBeInTheDocument();
        
        // Click again to collapse
        fireEvent.click(settingsMenuHeader!);
        expect(screen.queryByText('Khổ Giấy')).not.toBeInTheDocument();
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
