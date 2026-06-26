import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CrudModal, DeleteConfirm, FieldDef } from './CrudModal';

describe('CrudModal Component', () => {
    const mockFields: FieldDef[] = [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'age', label: 'Age', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
        { key: 'role', label: 'Role', type: 'select', options: [{ value: 'admin', label: 'Admin' }, { value: 'user', label: 'User' }] },
    ];

    const defaultProps = {
        isOpen: true,
        onClose: jest.fn(),
        onSave: jest.fn().mockResolvedValue(undefined),
        title: 'Test Entity',
        fields: mockFields,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        HTMLFormElement.prototype.requestSubmit = function () {
            this.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        };
    });

    it('renders the modal when isOpen is true', () => {
        render(<CrudModal {...defaultProps} />);
        expect(screen.getByText('Thêm mới Test Entity')).toBeInTheDocument();
        expect(screen.getByText('Name')).toBeInTheDocument();
        expect(screen.getByText('Age')).toBeInTheDocument();
    });

    it('does not render when isOpen is false', () => {
        render(<CrudModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText('Thêm mới Test Entity')).not.toBeInTheDocument();
    });

    it('populates initialData correctly', () => {
        const initialData = { name: 'John', age: 30, isActive: true, role: 'admin' };
        render(<CrudModal {...defaultProps} initialData={initialData} isEdit={true} />);
        
        expect(screen.getByText('Chỉnh sửa Test Entity')).toBeInTheDocument();
        expect(screen.getByDisplayValue('John')).toBeInTheDocument();
        expect(screen.getByDisplayValue('30')).toBeInTheDocument();
        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('calls onSave with updated form data on submit', async () => {
        const { container } = render(<CrudModal {...defaultProps} />);
        
        const inputs = container.querySelectorAll('input');
        const nameInput = inputs[0]; // Name text input
        fireEvent.change(nameInput, { target: { value: 'Alice' } });

        const ageInput = inputs[1]; // Age number input
        fireEvent.change(ageInput, { target: { value: '25' } });
        
        const saveButton = screen.getByText('Thêm mới');
        fireEvent.click(saveButton);
        
        await waitFor(() => {
            expect(defaultProps.onSave).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Alice',
                age: 25,
            }));
            expect(defaultProps.onClose).toHaveBeenCalled();
        });
    });

    it('displays error message if onSave fails', async () => {
        const onSaveFail = jest.fn().mockRejectedValue(new Error('Save failed'));
        render(<CrudModal {...defaultProps} onSave={onSaveFail} />);
        
        const saveButton = screen.getByText('Thêm mới');
        fireEvent.click(saveButton);
        
        await waitFor(() => {
            expect(screen.getByText('Save failed')).toBeInTheDocument();
        });
    });

    it('calls onClose when Cancel button or Escape key is pressed', () => {
        render(<CrudModal {...defaultProps} />);
        
        const cancelButton = screen.getByText('Hủy');
        fireEvent.click(cancelButton);
        expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
        
        fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
        expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
    });
});

describe('DeleteConfirm Component', () => {
    const defaultProps = {
        isOpen: true,
        onClose: jest.fn(),
        onConfirm: jest.fn().mockResolvedValue(undefined),
        itemName: 'Item to delete',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders delete confirmation', () => {
        render(<DeleteConfirm {...defaultProps} />);
        expect(screen.getByText('Xác nhận xóa')).toBeInTheDocument();
        expect(screen.getByText('Item to delete')).toBeInTheDocument();
    });

    it('calls onConfirm when clicking Delete', async () => {
        render(<DeleteConfirm {...defaultProps} />);
        const deleteButton = screen.getByText('Xóa');
        fireEvent.click(deleteButton);
        
        await waitFor(() => {
            expect(defaultProps.onConfirm).toHaveBeenCalled();
            expect(defaultProps.onClose).toHaveBeenCalled();
        });
    });

    it('calls onClose when Cancel is clicked', () => {
        render(<DeleteConfirm {...defaultProps} />);
        const cancelButton = screen.getByText('Hủy');
        fireEvent.click(cancelButton);
        expect(defaultProps.onClose).toHaveBeenCalled();
    });
});
