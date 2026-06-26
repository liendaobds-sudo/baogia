const { DataSource } = require('typeorm');

async function seed() {
  const ds = new DataSource({
    type: 'postgres', host: 'localhost', port: 5432,
    username: 'postgres', password: 'postgres', database: 'zeplao_erp',
    synchronize: false,
  });
  await ds.initialize();

  const customers = [
    { name: 'Nguyễn Văn Minh', phone: '0909123456', customer_type: 'individual', lifecycle_stage: 'prospect', source: 'zalo', product_interest: 'In namecard 500 tờ, couche 350gsm', lost_reason: 'Giá cao hơn đối thủ', follow_up_date: '2026-05-10' },
    { name: 'Trần Thị Hương', phone: '0912345678', customer_type: 'individual', lifecycle_stage: 'customer', source: 'quote', product_interest: 'In tờ rơi A5, banner quảng cáo' },
    { name: 'CÔNG TY TNHH ABC MEDIA', phone: '0283456789', customer_type: 'company', lifecycle_stage: 'vip', source: 'web', company: 'ABC Media Co., Ltd', tax_code: '0312345678', address: '123 Nguyễn Huệ, Q1, TP.HCM', contact_person: 'Lê Hoàng Nam', representative: 'Lê Hoàng Nam', position: 'Giám đốc' },
    { name: 'Phạm Đức Anh', phone: '0978111222', customer_type: 'individual', lifecycle_stage: 'lead', source: 'zalo', product_interest: 'Hỏi giá in menu nhà hàng' },
    { name: 'Lý Thanh Tùng', phone: '0933444555', customer_type: 'individual', lifecycle_stage: 'lost', source: 'quote', lost_reason: 'Đang so sánh nhiều nhà in', product_interest: 'In 5000 tờ rơi A4, 2 mặt', follow_up_date: '2026-05-15' },
    { name: 'CÔNG TY CP THƯƠNG MẠI HOÀNG GIA', phone: '0286789012', customer_type: 'company', lifecycle_stage: 'customer', source: 'quote', company: 'Hoàng Gia Trading JSC', tax_code: '0301234567', address: '456 Lê Lợi, Q3, TP.HCM', contact_person: 'Võ Minh Tuấn' },
    { name: 'Đỗ Thị Mai', phone: '0966777888', customer_type: 'individual', lifecycle_stage: 'prospect', source: 'zalo', product_interest: 'In thiệp cưới 200 bộ', follow_up_date: '2026-05-08' },
    { name: 'Hoàng Quốc Việt', phone: '0945222333', customer_type: 'individual', lifecycle_stage: 'lead', source: 'zalo' },
    { name: 'CÔNG TY TNHH SẢN XUẤT MINH PHÁT', phone: '0287654321', customer_type: 'company', lifecycle_stage: 'prospect', source: 'web', company: 'Minh Phát Manufacturing LLC', tax_code: '0309876543', product_interest: 'In hộp carton, tem nhãn sản phẩm số lượng lớn' },
    { name: 'Vũ Ngọc Hà', phone: '0918999000', customer_type: 'individual', lifecycle_stage: 'customer', source: 'quote', product_interest: 'In sticker, nhãn dán sản phẩm handmade' },
  ];

  for (const c of customers) {
    const maxRes = await ds.query('SELECT COALESCE(MAX(id),0)+1 as next FROM customers');
    const code = 'KH' + String(maxRes[0].next).padStart(4, '0');
    try {
      const cols = ['code','name','phone','customer_type','lifecycle_stage','source'];
      const vals = [code, c.name, c.phone, c.customer_type, c.lifecycle_stage, c.source];
      const optionals = { company: c.company, tax_code: c.tax_code, address: c.address, contact_person: c.contact_person, representative: c.representative, position: c.position, product_interest: c.product_interest, lost_reason: c.lost_reason, follow_up_date: c.follow_up_date };
      for (const [k, v] of Object.entries(optionals)) {
        if (v) { cols.push(k); vals.push(v); }
      }
      const placeholders = vals.map((_, i) => '$' + (i + 1)).join(',');
      await ds.query(`INSERT INTO customers (${cols.join(',')}) VALUES (${placeholders})`, vals);
      console.log('OK:', code, c.name, '-', c.lifecycle_stage);
    } catch (e) {
      console.log('SKIP:', c.name, e.message?.substring(0, 60));
    }
  }

  // Fetch inserted customers
  const allCusts = await ds.query('SELECT id, name FROM customers ORDER BY id DESC LIMIT 10');
  const findId = (name) => { const f = allCusts.find(c => c.name === name); return f ? f.id : null; };

  const interactions = [
    { cname: 'Nguyễn Văn Minh', type: 'quote_created', content: 'Tạo báo giá in namecard 500 tờ couche 350gsm - 850.000đ' },
    { cname: 'Nguyễn Văn Minh', type: 'lost_reason', content: 'Khách so sánh giá với nhà in Tân Bình, thấy rẻ hơn 15%', lost_reason: 'Giá cao hơn đối thủ' },
    { cname: 'Nguyễn Văn Minh', type: 'follow_up', content: 'Hẹn gọi lại tuần sau khi khách quyết định', follow_up_date: '2026-05-10' },
    { cname: 'Trần Thị Hương', type: 'quote_created', content: 'In 1000 tờ rơi A5 - 1.200.000đ' },
    { cname: 'Trần Thị Hương', type: 'stage_change', content: 'Chuyển trạng thái: prospect → customer (Hoàn thành đơn hàng)' },
    { cname: 'CÔNG TY TNHH ABC MEDIA', type: 'quote_created', content: 'In 10.000 brochure A4, gấp 3 - 15.500.000đ' },
    { cname: 'CÔNG TY TNHH ABC MEDIA', type: 'note', content: 'Khách VIP, luôn yêu cầu proof màu trước khi in. Thích giấy couche 200gsm.' },
    { cname: 'CÔNG TY TNHH ABC MEDIA', type: 'stage_change', content: 'Chuyển trạng thái: customer → vip (RFM Score = 14)' },
    { cname: 'Lý Thanh Tùng', type: 'quote_created', content: 'In 5000 tờ rơi A4, 2 mặt, 4 màu - 4.800.000đ' },
    { cname: 'Lý Thanh Tùng', type: 'lost_reason', content: 'Khách nói đang lấy giá 3 nơi, sẽ quyết định sau 2 tuần', lost_reason: 'Đang so sánh nhiều nhà in' },
    { cname: 'Đỗ Thị Mai', type: 'quote_created', content: 'In thiệp cưới 200 bộ kèm phong bì - 3.600.000đ' },
    { cname: 'Đỗ Thị Mai', type: 'note', content: 'Khách muốn thiết kế theo mẫu riêng, cần gửi file AI. Hẹn gửi file ngày 08/05.' },
  ];

  for (const int of interactions) {
    const cid = findId(int.cname);
    if (!cid) { console.log('NOT FOUND:', int.cname); continue; }
    const cols = ['customer_id', 'type', 'content'];
    const vals = [cid, int.type, int.content];
    if (int.lost_reason) { cols.push('lost_reason'); vals.push(int.lost_reason); }
    if (int.follow_up_date) { cols.push('follow_up_date'); vals.push(int.follow_up_date); }
    const ph = vals.map((_, i) => '$' + (i + 1)).join(',');
    await ds.query(`INSERT INTO customer_interactions (${cols.join(',')}) VALUES (${ph})`, vals);
    console.log('INT:', int.cname, '-', int.type);
  }

  console.log('\n=== Seed Complete! ===');
  const summary = await ds.query("SELECT lifecycle_stage, COUNT(*) as cnt FROM customers GROUP BY lifecycle_stage ORDER BY cnt DESC");
  console.log('Pipeline summary:', summary);
  await ds.destroy();
}
seed();
