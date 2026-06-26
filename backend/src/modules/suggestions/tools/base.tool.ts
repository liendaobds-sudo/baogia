export interface BaseTool {
    /** Lệnh gọi Tool (phải là chữ thường, phân cách bởi dấu gạch dưới) */
    name: string;
    /** Mô tả chức năng Tool để AI biết khi nào nên gọi */
    description: string;
    /** JSON Schema định nghĩa tham số đầu vào của Tool (dành cho Gemini Function Calling) */
    parameters: any;
    /** Hàm thực thi logic của Tool */
    execute(args: any, context: any): Promise<string>;
}
