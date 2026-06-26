import { ChatMsg } from '../types';

interface ChatMessageProps {
    message: ChatMsg;
}

export function ChatMessage({ message }: ChatMessageProps) {
    const isCustomer = message.senderType === 'customer';
    const time = new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    return (
        <div className={`flex mb-3 ${isCustomer ? 'justify-start' : 'justify-end'}`}>
            <div className={`
                max-w-[70%] px-3.5 py-2.5 text-[13px] leading-relaxed relative
                ${isCustomer
                    ? 'bg-slate-100 text-slate-900 rounded-[14px] rounded-bl-[4px]'
                    : 'bg-indigo-600 text-white rounded-[14px] rounded-br-[4px]'
                }
            `}>
                <div>{message.content}</div>
                <div className={`text-[10px] mt-1 opacity-60 ${isCustomer ? 'text-left' : 'text-right'}`}>
                    {isCustomer ? '👤 Khách' : '🤖 Agent'} · {time}
                </div>
            </div>
        </div>
    );
}
