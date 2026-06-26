const fs = require('fs');
const path = require('path');
const API = 'http://localhost:4000/api/v1';

async function login() {
    const res = await fetch(`${API}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@zalohub.vn', password: 'admin123' }),
    });
    return (await res.json()).accessToken;
}

const KB_DOCS = [
    { file: '01-bang-gia-tham-khao.md', tags: 'bảng giá,pricing,giá tham khảo' },
    { file: '02-danh-muc-chat-lieu.md', tags: 'chất liệu,giấy,vật tư,materials' },
    { file: '03-ky-thuat-gia-cong.md', tags: 'gia công,kỹ thuật,finishing' },
    { file: '04-quy-trinh-chinh-sach.md', tags: 'quy trình,chính sách,policy' },
    { file: '05-thiet-ke-cho-in.md', tags: 'thiết kế,CMYK,bleed,font,file in' },
    { file: '06-ky-thuat-in-nang-cao.md', tags: 'offset,digital,UV,silkscreen,bao bì,biển hiệu' },
];

async function upload() {
    console.log('🔐 Logging in...');
    const token = await login();
    if (!token) { console.error('❌ Login failed!'); return; }

    // Delete existing KB documents first
    console.log('\n🗑️ Removing old KB documents...');
    const existing = await fetch(`${API}/kb/documents`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const existingDocs = await existing.json();
    if (Array.isArray(existingDocs) && existingDocs.length > 0) {
        for (const doc of existingDocs) {
            await fetch(`${API}/kb/documents/${doc.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            console.log(`   Deleted: ${doc.title}`);
        }
    }

    // Upload new documents
    console.log('\n📤 Uploading new KB documents...\n');
    const kbDir = path.join(__dirname, 'kb-docs');

    for (const doc of KB_DOCS) {
        const filePath = path.join(kbDir, doc.file);
        if (!fs.existsSync(filePath)) {
            console.error(`❌ File not found: ${filePath}`);
            continue;
        }

        const fileContent = fs.readFileSync(filePath);
        const formData = new FormData();
        formData.append('file', new Blob([fileContent]), doc.file);
        formData.append('tags', doc.tags);

        try {
            const res = await fetch(`${API}/kb/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`✅ ${doc.file}`);
                console.log(`   Title: ${data.title}`);
                console.log(`   Size: ${(data.fileSize / 1024).toFixed(1)} KB`);
                console.log(`   Tags: ${doc.tags}`);
                console.log();
            } else {
                const err = await res.text();
                console.error(`❌ ${doc.file}: ${err}`);
            }
        } catch (err) {
            console.error(`❌ ${doc.file}: ${err.message}`);
        }
    }

    // Wait for processing
    console.log('⏳ Waiting for indexing...');
    await new Promise(r => setTimeout(r, 3000));

    // Check final status
    const final = await fetch(`${API}/kb/documents`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const finalDocs = await final.json();
    const totalChunks = finalDocs.reduce((s, d) => s + d.chunkCount, 0);
    console.log(`\n🎉 Done! ${finalDocs.length} documents, ${totalChunks} chunks indexed`);
    finalDocs.forEach(d => console.log(`   📄 ${d.title} — ${d.chunkCount} chunks — ${d.status}`));

    process.exit(0);
}

upload().catch(e => { console.error(e); process.exit(1); });
