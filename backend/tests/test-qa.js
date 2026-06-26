const API = 'http://localhost:4000/api/v1';
async function test() {
    const loginRes = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@zalohub.vn', password: 'admin123' }) });
    const token = (await loginRes.json()).accessToken;
    const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const all = await fetch(API + '/canned-responses', { headers: h });
    const items = await all.json();
    console.log('Total Q&A in DB:', items.length);

    function findByKeywords(msg) {
        const msgLower = msg.toLowerCase();
        return items
            .filter(cr => cr.triggerKeywords && cr.triggerKeywords.trim() !== '')
            .map(cr => {
                const keywords = cr.triggerKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
                const matched = keywords.filter(kw => msgLower.includes(kw));
                return { title: cr.title, matchCount: matched.length, total: keywords.length, matched, autoReply: cr.autoReply };
            })
            .filter(s => s.matchCount > 0)
            .sort((a, b) => b.matchCount - a.matchCount);
    }

    const tests = [
        'cho mình hỏi giá in namecard với',
        'bên em giao hàng miễn phí không',
        'mình cần in hộp mỹ phẩm',
        'có xuất hóa đơn VAT không',
        'in tờ rơi A5 bao nhiêu tiền',
        'hello',
        'file gửi dạng PDF hay AI',
        'mình muốn in menu cho quán cafe',
        'deadline mấy ngày',
        'in offset hay digital rẻ hơn',
        'có freeship không',
        'cần in backdrop cho sự kiện',
        'tui can in, tu van giup toi',
    ];

    console.log('\n=== TEST KEYWORD MATCHING ===\n');
    for (const msg of tests) {
        const results = findByKeywords(msg);
        const top = results[0];
        console.log('Customer:', msg);
        if (top) {
            console.log('  MATCH:', top.title, '(' + top.matchCount + '/' + top.total + ' kw)');
            console.log('  Keywords:', top.matched.join(', '));
            console.log('  AutoReply:', top.autoReply ? 'YES' : 'NO (suggest)');
            if (results.length > 1) console.log('  Also:', results.slice(1, 3).map(r => r.title).join(' | '));
        } else {
            console.log('  NO MATCH');
        }
        console.log();
    }
    process.exit(0);
}
test().catch(e => { console.error(e); process.exit(1); });
