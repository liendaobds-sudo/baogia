import { nextNarrowView, type NarrowView } from './narrowView';

/**
 * Máy trạng thái chuyển Khung_Nhìn (Bố_Cục_Hẹp).
 * Validates: Requirements 2.2, 2.3, 2.4
 */
describe('nextNarrowView', () => {
    it('chọn hội thoại: bất kỳ → chat', () => {
        (['list', 'chat', 'info'] as NarrowView[]).forEach(v =>
            expect(nextNarrowView(v, 'select')).toBe('chat'),
        );
    });

    it('back: → list', () => {
        expect(nextNarrowView('chat', 'back')).toBe('list');
        expect(nextNarrowView('info', 'back')).toBe('list');
    });

    it('openInfo chỉ có tác dụng từ chat', () => {
        expect(nextNarrowView('chat', 'openInfo')).toBe('info');
        expect(nextNarrowView('list', 'openInfo')).toBe('list'); // không nhảy info khi chưa xem chat
    });

    it('closeInfo: info → chat (nghịch đảo openInfo)', () => {
        expect(nextNarrowView('info', 'closeInfo')).toBe('chat');
        expect(nextNarrowView('chat', 'closeInfo')).toBe('chat');
    });

    it('clearSelected: → list', () => {
        (['list', 'chat', 'info'] as NarrowView[]).forEach(v =>
            expect(nextNarrowView(v, 'clearSelected')).toBe('list'),
        );
    });

    it('chu trình nghịch đảo: list→chat→info→chat→list', () => {
        let v: NarrowView = 'list';
        v = nextNarrowView(v, 'select'); expect(v).toBe('chat');
        v = nextNarrowView(v, 'openInfo'); expect(v).toBe('info');
        v = nextNarrowView(v, 'closeInfo'); expect(v).toBe('chat');
        v = nextNarrowView(v, 'back'); expect(v).toBe('list');
    });
});
